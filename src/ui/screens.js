// Menu flow: title (CPU fight behind) -> main menu -> local / host online / join online -> character select
// -> stage & rules -> match -> results. Gamepad first (stick / D-pad, A confirm, B back), keyboard and mouse too.
import * as THREE from 'three';
import { Input } from '../core/input.js';
import { CHARS, CHAR_ORDER } from '../sim/chars/index.js';
import { ULTI_NAMES, startMinigame } from '../sim/minigames.js';
import { STAGES, STAGE_ORDER } from '../sim/stages/index.js';
import { COLORS } from '../sim/constants.js';
import { Session } from '../game/session.js';
import { LocalMatch } from '../game/localMatch.js';
import { ClientMatch } from '../game/clientMatch.js';
import { RollbackMatch } from '../game/rollbackMatch.js';
import { Showcase } from './showcase.js';
import { EMOTES } from '../render/rig/nativeMoves.js';
import { portraitURL } from './hud.js';
import { buildStageView, syncStageView } from '../render/stages/index.js';
import { World } from '../sim/world.js';
import { Crypt, VW, VH } from './crypt.js';
import { Slab } from './slab.js';
import { fitPx } from './pxgrid.js';
import { Bar } from './bar.js';
import { burst, splash, lines, flash, fitText, randomWord } from './juice.js';
import { installTournament } from './tournament.js';
import { ComicMenu } from './comicMenu.js';
import { roundName, matchById } from '../game/tournament.js';
import { Logo3D } from './logo3d.js';
import { Versus } from './versus.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const CS_TILES = [...CHAR_ORDER, 'random'];
// the fighters and the random tile on 3 rows; past 7 columns the grid is scaled down to the width of 7
const GRID_COLS = Math.max(7, Math.ceil(CS_TILES.length / 3));
const UI = 'assets/ui/crypt/';
const WOB = 'assets/ui/wob/'; // World of Bagarre: the logo and the title art (tools/art/wob.ps1)
const PAINTED_THUMBS = new Set(['cemetery', 'swamp', 'elysee', 'diner', 'cave', 'arena', 'village', 'sea', 'attic', 'mirror', 'zinzin']);
let inputLock = false; // during a screen change
// the mouse picks a menu line only when it really moves over it: a cursor left resting on the menu must not steal the
// keyboard's choice when the buttons move under it (their entrance, the pop of the chosen one)
const realMove = (e) => !!(e.movementX || e.movementY);

function anyMenu() {
  const ev = { up: 0, down: 0, left: 0, right: 0, confirm: 0, back: 0, start: 0, x: 0, y: 0, dev: null };
  if (inputLock) return ev;
  for (const d of Input.list()) {
    for (const k of Object.keys(ev)) if (k !== 'dev' && d.menu[k]) { ev[k] = 1; ev.dev = ev.dev || d.id; }
  }
  return ev;
}

function padLabel(dev) {
  const d = Input.get(dev);
  if (!d) return '?';
  if (d.type === 'keyboard') return dev === 'kb1' ? 'Clavier ZQSD' : 'Clavier flèches';
  if (d.type === 'virtual') return 'Virtuelle';
  return d.name;
}

// list menu: [{label, act, val, left, right, hint}]
class ListMenu {
  constructor(parent, items, opts = {}) {
    this.items = items; this.i = 0; this.opts = opts;
    this.el = h('div', 'list ' + (opts.cls || ''));
    parent.appendChild(this.el);
    this.render();
  }
  render() {
    this.el.innerHTML = '';
    this.items.forEach((it, i) => {
      const b = h('button', 'item' + (i === this.i ? ' focus' : '') + (it.disabled ? ' disabled' : ''));
      b.innerHTML = `<span class="lab">${it.label}</span>` + (it.val ? `<span class="val">◀ ${it.val()} ▶</span>` : '') + (it.hint ? `<small>${it.hint}</small>` : '');
      b.onmousemove = (e) => { if (realMove(e) && this.i !== i) { this.i = i; this.render(); } };
      b.onclick = (e) => {
        if (it.val && e.target.closest('.val')) { const r = e.target.getBoundingClientRect(); (e.clientX - r.left < r.width / 2 ? it.left : it.right)?.(); this.render(); return; }
        this.activate(i);
      };
      this.el.appendChild(b);
    });
  }
  activate(i) { const it = this.items[i]; if (!it || it.disabled) return; window.__app.audio.sfx('menuOk'); it.act ? it.act() : it.right?.(); this.render(); }
  update(ev) {
    const n = this.items.length;
    if (ev.up) { this.i = (this.i + n - 1) % n; window.__app.audio.sfx('menuMove'); this.render(); }
    if (ev.down) { this.i = (this.i + 1) % n; window.__app.audio.sfx('menuMove'); this.render(); }
    const it = this.items[this.i];
    if (ev.left && it.left) { it.left(); window.__app.audio.sfx('menuMove'); this.render(); }
    if (ev.right && it.right) { it.right(); window.__app.audio.sfx('menuMove'); this.render(); }
    if (ev.confirm) this.activate(this.i);
  }
}

// a menu of tomb slabs (pixel art): [{label, hint, act}], a skeleton hand points at the chosen one
class PixelMenu {
  constructor(parent, items, opts = {}) {
    this.items = items; this.i = 0; this.opts = opts;
    this.el = h('div', 'pmenu');
    this.el.style.top = (opts.top ?? 128) + 'px';
    parent.appendChild(this.el);
    this.btns = items.map((it, i) => {
      const b = h('div', 'pbtn', `<img src="${UI}hd/button.png" width="174" alt=""><img class="slime" src="${UI}hd/slime.png" width="194" alt=""><span class="lab">${it.label}</span>` + (it.hint ? `<span class="hint">${it.hint}</span>` : ''));
      b.style.top = i * (opts.gap ?? 44) + 'px';
      b.style.setProperty('--i', i);
      b.onmousemove = (e) => { if (realMove(e)) this.focus(i); };
      b.onclick = () => { this.focus(i); this.activate(); };
      b.addEventListener('animationend', () => b.classList.add('in'), { once: true });
      this.el.appendChild(b);
      return b;
    });
    this.hand = h('img', 'hand');
    this.hand.src = UI + 'hd/hand.png'; this.hand.width = 42;
    this.el.appendChild(this.hand);
    this.focus(0, true);
  }
  focus(i, quiet) {
    if (i === this.i && !quiet) return;
    this.btns[this.i].classList.remove('on', 'pop');
    this.i = i;
    const b = this.btns[i];
    b.classList.add('on');
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    this.hand.style.top = (parseInt(b.style.top, 10) + 11) + 'px';
    if (!quiet) window.__app.audio.sfx('menuMove');
  }
  activate() {
    const it = this.items[this.i];
    if (!it || it.disabled || this.done) return;
    this.done = true;
    const b = this.btns[this.i];
    b.classList.remove('press'); void b.offsetWidth; b.classList.add('press');
    window.__app.audio.sfx('menuOk');
    if (this.opts.crypt) this.opts.crypt.shake(2, 0.15);
    setTimeout(() => { this.done = false; it.act(); }, 110);
  }
  update(ev) {
    const n = this.items.length;
    if (ev.up) this.focus((this.i + n - 1) % n);
    if (ev.down) this.focus((this.i + 1) % n);
    if (ev.confirm) this.activate();
  }
}

// rows on a stone tablet: [{label, val, left, right, act}]; ←→ change a value, A acts, the hand points at the row.
// opts.maxRows: at most that many rows shown, the list scrolls with the hand (and the mouse wheel), ▲ ▼ when there is more
class PixelList {
  constructor(parent, items, opts = {}) {
    this.items = items; this.i = 0; this.rowH = opts.rowH ?? 18; // rows of fixed height (css .prow)
    this.max = opts.maxRows || items.length; this.off = 0;
    this.el = h('div', 'plist stone');
    this.el.style.left = (opts.left ?? 170) + 'px';
    this.el.style.top = (opts.top ?? 64) + 'px';
    this.el.style.width = (opts.width ?? 300) + 'px';
    parent.appendChild(this.el);
    this.rows = items.map((it, i) => {
      const r = h('div', 'prow', `<span class="pl">${it.label}</span>` + (it.val ? `<span class="pv"><img class="al" src="${UI}hd/arrow_l.png" width="8" alt="">${it.bar ? '<i class="pbar"><i></i></i>' : ''}<b></b><img class="ar" src="${UI}hd/arrow_r.png" width="8" alt=""></span>` : ''));
      r.style.setProperty('--i', i);
      r.onmousemove = (e) => { if (realMove(e)) this.focus(i); };
      r.onclick = (e) => {
        this.focus(i);
        if (it.val && e.target.closest('.pv')) { const b = e.target.closest('.pv').getBoundingClientRect(); this.change(e.clientX - b.left < b.width / 2 ? -1 : 1); return; }
        this.activate();
      };
      this.el.appendChild(r);
      return r;
    });
    this.hand = h('img', 'hand');
    this.hand.src = UI + 'hd/hand.png'; this.hand.width = 42;
    this.el.appendChild(this.hand);
    if (this.max < items.length) {
      this.more = [h('div', 'pmore up', '▲'), h('div', 'pmore down', '▼')];
      for (const m of this.more) { m.style.cssText = 'position:absolute;right:6px;font-size:10px;color:#ffd23b;pointer-events:none;'; this.el.appendChild(m); }
      this.more[0].style.top = '-12px'; this.more[1].style.bottom = '-12px';
      this.el.addEventListener('wheel', (e) => { e.preventDefault(); this.focus(Math.max(0, Math.min(items.length - 1, this.i + (e.deltaY > 0 ? 1 : -1)))); }, { passive: false });
    }
    this.focus(0, true);
    this.render();
  }
  // the rows in view: from off to off + max (the others are hidden)
  scrollTo(i) {
    const n = this.items.length, off = Math.max(0, Math.min(n - this.max, i < this.off ? i : i >= this.off + this.max ? i - this.max + 1 : this.off));
    if (off === this.off && this.shown) return;
    this.off = off; this.shown = true;
    this.rows.forEach((r, k) => { r.style.display = k >= off && k < off + this.max ? '' : 'none'; });
    if (this.more) { this.more[0].style.visibility = off > 0 ? 'visible' : 'hidden'; this.more[1].style.visibility = off + this.max < n ? 'visible' : 'hidden'; }
  }
  render() {
    this.items.forEach((it, i) => {
      if (it.val) this.rows[i].querySelector('.pv b').textContent = it.val();
      if (it.bar) this.rows[i].querySelector('.pbar i').style.width = Math.round(it.bar() * 100) + '%';
    });
  }
  focus(i, quiet) {
    if (i === this.i && !quiet) return;
    this.rows[this.i].classList.remove('on');
    this.i = i;
    const r = this.rows[i];
    r.classList.add('on');
    this.scrollTo(i);
    this.hand.style.top = ((i - this.off) * this.rowH + 1) + 'px';
    if (!quiet) window.__app.audio.sfx('menuMove');
  }
  change(d) {
    const it = this.items[this.i];
    const f = d < 0 ? it.left : it.right;
    if (!f) return;
    f();
    window.__app.audio.sfx('menuMove');
    const b = this.rows[this.i].querySelector('.pv');
    if (b) { b.classList.remove('kick', 'kickl'); void b.offsetWidth; b.classList.add(d < 0 ? 'kickl' : 'kick'); }
    this.render();
  }
  activate() {
    const it = this.items[this.i];
    if (!it) return;
    if (!it.act) { this.change(1); return; }
    const r = this.rows[this.i];
    r.classList.remove('press'); void r.offsetWidth; r.classList.add('press');
    window.__app.audio.sfx('menuOk');
    it.act();
    this.render();
  }
  update(ev) {
    const n = this.items.length;
    if (ev.up) this.focus((this.i + n - 1) % n);
    if (ev.down) this.focus((this.i + 1) % n);
    if (ev.left) this.change(-1);
    if (ev.right) this.change(1);
    if (ev.confirm) this.activate();
  }
}

export class Screens {
  constructor(app) {
    this.app = app;
    this.layer = h('div', 'screens');
    app.ui.appendChild(this.layer);
    this.attract = null;
    this.session = null;
    this.thumbs = {};
    // the pixel art menus: the graveyard scene behind, the tomb door for screen changes, the 640x360 grid
    this.crypt = new Crypt(app.ui);
    this.crypt.show(false);
    this.slab = new Slab(app, this.crypt);
    fitPx();
  }

  // change screen behind the falling tomb door (input ignored meanwhile)
  go(fn) {
    if (this.slab.busy) return;
    inputLock = true;
    this.slab.go(() => fn());
    setTimeout(() => { inputLock = false; }, 700);
  }

  set(update, dispose) {
    this.layer.innerHTML = '';
    this.app.setScreen({ update, dispose });
  }

  // ---- behind the menus: the graveyard where the friends hang out (pixel art, src/ui/crypt.js) ----------------------
  // dim: how much the scene is darkened (the title and the main menu show it fully, the panels need it darker)
  startAttract(dim = 0.55, music = 'menu') {
    if (this.resShow) { this.resShow.dispose(); this.resShow = null; }
    this.crypt.setDim(dim);
    this.music(music);
    if (this.crypt.on) return;
    this.crypt.show(true);
  }
  // the music of a screen (only when it changes: a menu after another keeps its song going)
  music(id) { if (this.curMusic !== id) { this.curMusic = id; this.app.audio.playMusic(id); } }
  stopAttract() {
    this.crypt.show(false);
    this.curMusic = null; // a match or a 3D screen plays its own
    if (this.attract) { this.attract.dispose(); this.attract = null; }
    if (this.resShow) { this.resShow.dispose(); this.resShow = null; }
  }
  attractUpdate(dt) { try { this.crypt.update(dt); } catch (e) { this.app.report(e); } }

  // ---- the gate: the very first screen, before the title ------------------------------------------------------
  // Sober but alive: a dark screen, a glow that breathes, embers rising, a shiny A button and the invitation waving
  // letter by letter. A (or Enter, or a click) presses the button: a shock ring, a flash, the words burst away, and the
  // title comes in with its logo. That first press also lets the browser play sound: the title song starts with it.
  gate() {
    this.stopAttract();
    fitPx();
    const bg = h('div', 'gate');
    bg.innerHTML = '<i class="g-glow"></i>' + Array.from({ length: 28 }, () => {
      const x = (Math.random() * 100).toFixed(1), d = (5 + Math.random() * 7).toFixed(2), dl = (-Math.random() * 12).toFixed(2), s = (1.5 + Math.random() * 2.5).toFixed(1);
      return '<i class="g-ember" style="left:' + x + '%;width:' + s + 'px;height:' + s + 'px;animation-duration:' + d + 's;animation-delay:' + dl + 's"></i>';
    }).join('');
    const el = h('div', 'px gate-px');
    let n = 0;
    const line = [...'pour entrer dans le monde de la bagarre'].map((ch) => {
      if (ch === ' ') return '<span class="g-sp"> </span>';
      const i = n++, a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 120;
      return '<span class="g-c" style="--i:' + i + ';--dx:' + (Math.cos(a) * r).toFixed(0) + 'px;--dy:' + (Math.sin(a) * r - 40).toFixed(0) + 'px;--rz:' + ((Math.random() - 0.5) * 120).toFixed(0) + 'deg">' + ch + '</span>';
    }).join('');
    el.innerHTML = '<div class="g-row"><span class="g-lead">APPUIE SUR</span><b class="g-btn"><i></i>A</b></div>'
      + '<div class="g-line">' + line + '</div><div class="g-sub">ou Entrée · ou un clic</div><i class="g-ring"></i><i class="g-ring g-ring2"></i><i class="g-flash"></i>';
    let leaving = false;
    const go = () => {
      if (leaving) return;
      leaving = true;
      this.app.audio.unlock();
      this.app.audio.sfx('menuOk');
      this.app.audio.sfx('whoosh', 0, 0.9);
      bg.classList.add('go'); el.classList.add('go');
      setTimeout(() => this.title(), 560);
    };
    const click = (e) => { if (e.button === 0) go(); };
    this.set(() => { const ev = anyMenu(); if (ev.confirm || ev.start) go(); }, () => { removeEventListener('pointerdown', click); bg.remove(); });
    this.layer.appendChild(bg);
    this.layer.appendChild(el);
    addEventListener('pointerdown', click);
  }

  // ---- title ---------------------------------------------------------------------------------------------------
  // the brawl and the big logo in 3D (src/ui/logo3d.js: it flies in and slams); A goes to the main menu
  title() {
    this.startAttract(0.5, 'title'); // the graveyard in the dark until the lightning (main menu)
    for (const c of this.crypt.cast) { c.rise = 0; c.delay = 1e9; } // hidden until the menu
    const el = h('div', 'px');
    el.innerHTML = `<div class="row" style="top:16px"><img class="logo-big" src="${WOB}logo.png" width="340" alt="World of Bagarre" style="visibility:hidden"></div>
      <div class="press txt">Appuie sur <b>A</b> ou <b>Entrée</b></div>
      <div class="credits txt">${CHAR_ORDER.length} bagarreurs · ${STAGE_ORDER.length} arènes · jusqu'à 4 joueurs · en ligne · par VibePandrezz</div>`;
    // the logo in 3D over the art (the picture of it stays as a fallback, hidden, for a machine without WebGL)
    const logo = new Logo3D(document.body, WOB + 'logo.png', { x: 320, y: 16 + 105, w: 340, onSlam: () => {
      this.app.audio.sfx('punchHeavy', 0, 0.8);
      this.crypt.shake(5, 0.35);
      for (let i = 0; i < 4; i++) this.crypt.impact(200 + Math.random() * 240, 60 + Math.random() * 120);
    } });
    if (logo.failed) { logo.dispose(); el.querySelector('.logo-big').style.visibility = ''; }
    let leaving = false;
    const go = () => {
      if (leaving) return;
      leaving = true;
      this.app.audio.unlock();
      this.app.audio.sfx('menuOk');
      this.app.audio.sfx('thud', 0, 0.7);
      el.querySelector('.logo-big').classList.add('out');
      logo.leave();
      el.querySelector('.press').remove();
      this.crypt.shake(4, 0.35);
      setTimeout(() => this.mainMenu(true), 240);
    };
    // a click anywhere goes on (also outside the 640x360 grid, in the margins of a window that is not 16:9)
    const click = (e) => { if (e.button === 0) go(); };
    this.set((dt) => {
      this.attractUpdate(dt);
      const ev = anyMenu();
      if (ev.confirm || ev.start) go();
    }, () => { removeEventListener('pointerdown', click); logo.dispose(); });
    this.layer.appendChild(el);
    addEventListener('pointerdown', click);
  }

  // fromTitle: the friends rise from their graves and the slabs fly in
  mainMenu(fromTitle) {
    this.startAttract(0);
    if (this.session) { this.session.close(); this.session = null; }
    if (fromTitle || this.crypt.cast.some((c) => c.rise < 1 && c.delay > 100)) { this.crypt.rise(); this.app.audio.sfx(this.crypt.wob ? 'punchHeavy' : 'thunder', 0, 0.55); } // (World of Bagarre: a punch, not thunder)
    const el = h('div', 'px');
    el.innerHTML = `<div class="row" style="top:2px"><img class="logo-s" src="${WOB}logo_s.png" width="176" alt="World of Bagarre"></div>`;
    // a comic page: what to play on the left, the rest on the right (src/ui/comicMenu.js)
    const menu = new ComicMenu(el, [
      { label: 'COMBAT LOCAL', icon: '⚔️', word: 'BASTON !', hint: 'Sur ce PC : manettes et claviers, jusqu’à 4, avec ou sans CPU', act: () => this.go(() => this.startLocal()) },
      { label: 'TOURNOI', icon: '🏆', word: 'TOURNOI !', hint: 'Des duels entre potes, un arbre, un seul champion (sur ce PC ou en ligne)', act: () => this.go(() => this.tourMenu()) },
      { label: 'CRÉER UN SALON', icon: '📡', word: 'EN LIGNE !', hint: 'Tes potes te rejoignent sur internet avec un code', act: () => this.go(() => this.startHost()) },
      { label: 'REJOINDRE', icon: '🔑', word: 'TOC TOC !', hint: 'Entre le code du salon de ton pote', act: () => this.go(() => this.joinScreen()) },
      { label: 'MINI-JEUX', icon: '🎲', word: 'JEU !', hint: 'Lancer chaque mini-jeu à part, pour s’entraîner', act: () => this.go(() => this.minigameLab()) },
      { label: 'ALLER AU BAR', icon: '🍺', word: 'SANTÉ !', hint: 'Boire un coup avec les potes, les écouter raconter leur vie', act: () => this.go(() => this.bar()) },
      { label: 'COMMENT JOUER', icon: '📖', word: 'LIS ÇA !', hint: 'Les coups, les règles, les astuces', act: () => this.go(() => this.howto()) },
      { label: 'OPTIONS', icon: '⚙️', word: 'RÉGLAGES !', hint: 'Son, image, hémoglobine, manette', act: () => this.go(() => this.options()) },
    ], { crypt: this.crypt, cols: [{ title: 'JOUER', items: [0, 1, 2, 3] }, { title: 'ET AUSSI', items: [4, 5, 6, 7] }], x: 148, top: 132, w: 152, ph: 34, gap: 6, colGap: 40 });
    if (!fromTitle && this.menuI) menu.focus(this.menuI, true); // back from a screen: the hand points at it again
    this.set((dt) => {
      this.attractUpdate(dt);
      const ev = anyMenu();
      menu.update(ev);
      this.menuI = menu.i;
      if (ev.back) { this.app.audio.sfx('menuBack'); this.crypt.sink(); this.title(); }
    });
    this.layer.appendChild(el);
  }

  // ---- sessions -------------------------------------------------------------------------------------------------
  startLocal() {
    this.session = new Session(this.app, 'local');
    this.session.onCmd = (k, a) => this.lobbyCmd(k, a);
    this.charSelect();
  }

  // local and host: the screen changes of the lobby, asked by whoever chooses the arena (a guest too: the player who
  // pressed START; the others, the host included, watch)
  lobbyCmd(k, stage) {
    // the tomb door is still moving (the previous screen change): do it right after, not never
    if (this.slab.busy) { setTimeout(() => this.lobbyCmd(k, stage), 120); return; }
    if (k === 'stagesel') this.go(() => this.stageSelect());
    else if (k === 'charsel') this.go(() => { this.goto('charsel'); this.charSelect(); });
    else if (k === 'launch') {
      // one launch at a time: a second request (A pressed twice, A then a click, a rematch asked twice) while the first
      // waits for the tomb door would start a second match over the first one (its fighters left standing at the spawn)
      const now = performance.now();
      if (this.launchAt && now - this.launchAt < 2500) return;
      this.launchAt = now;
      this.go(() => this.startMatch(stage));
    }
    // the tournament (src/ui/tournament.js)
    else if (k === 'tbracket') { this.goto('tbracket'); this.go(() => { this.stopMatch(); this.tourBracket(); }); }
    else if (k === 'tvs') { this.goto('tvs'); this.go(() => this.tourVS(stage)); }
    else if (k === 'tchamp') { this.goto('tchamp'); this.go(() => this.tourChamp()); }
  }

  async startHost() {
    const transport = this.app.params.get('net') === 'local' ? 'local' : 'peer';
    this.session = new Session(this.app, 'host', transport);
    this.session.onCmd = (k, a) => this.lobbyCmd(k, a);
    this.wait('Ouverture du salon…');
    try {
      await this.session.hostOnline();
      this.hookHost();
      this.charSelect();
    } catch (e) { this.error('Impossible de créer le salon : ' + (e.message || e.type || e)); }
  }

  joinScreen() {
    this.startAttract(0.6, 'lobby');
    const el = h('div', 'px');
    el.innerHTML = '<div class="ptitle txt">REJOINDRE UN SALON</div>';
    const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ';
    const code = (localStorage.getItem('spookybagarre.lastCode') || 'AAAA').split('');
    let pos = 0;
    const box = h('div', 'pcode');
    el.appendChild(box);
    el.appendChild(h('div', 'phint txt', 'Stick, ZQSD ou flèches : ↑↓ la lettre, ←→ bouger · ou clique dans le champ, tape le code, puis Entrée'));
    const input = h('input', 'pinput');
    input.maxLength = 4; input.placeholder = 'CODE';
    el.appendChild(input);
    const render = (bump) => {
      box.innerHTML = code.map((c, i) => `<div class="pslot${i === pos ? ' on' : ''}${i === bump ? ' bump' : ''}">${i === pos ? `<img class="up" src="${UI}hd/arrow_r.png" width="8" alt=""><img class="dn" src="${UI}hd/arrow_r.png" width="8" alt="">` : ''}<b>${c}</b></div>`).join('');
    };
    render();
    // typed in the field: Entrée joins, Échap leaves the field (the game ignores the keys typed into a field)
    input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } else if (e.key === 'Escape') input.blur(); };
    input.oninput = () => { const v = input.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); input.value = v; for (let i = 0; i < 4; i++) code[i] = v[i] || code[i]; render(); };
    const go = () => {
      const c = code.join('');
      localStorage.setItem('spookybagarre.lastCode', c);
      const transport = this.app.params.get('net') === 'local' ? 'local' : 'peer';
      this.go(async () => {
        this.session = new Session(this.app, 'client', transport);
        this.wait('Connexion au salon ' + c);
        try { await this.session.joinOnline(c); this.hookClient(); await this.clientRoute(); }
        catch (e) { this.error('Connexion impossible : ' + (e.message || e.type || e)); }
      });
    };
    const menu = new PixelMenu(el, [{ label: 'REJOINDRE', hint: 'le code est sur l\'écran de ton pote', act: go }], { crypt: this.crypt, top: 252 });
    this.set((dt) => {
      this.attractUpdate(dt);
      if (document.activeElement === input) { if (anyMenu().confirm) go(); return; }
      const ev = anyMenu();
      if (ev.left) { pos = (pos + 3) % 4; render(); this.app.audio.sfx('menuMove'); }
      if (ev.right) { pos = (pos + 1) % 4; render(); this.app.audio.sfx('menuMove'); }
      if (ev.up || ev.down) { let k = letters.indexOf(code[pos]); k = (k + (ev.up ? 1 : -1) + letters.length) % letters.length; code[pos] = letters[k]; render(pos); this.app.audio.sfx('menuMove'); }
      if (ev.confirm) menu.activate();
      if (ev.back) { this.app.audio.sfx('menuBack'); this.go(() => this.mainMenu()); }
    });
    this.layer.appendChild(el);
  }

  // a message on a stone tablet while something happens (opening a lobby, joining one)
  wait(msg) {
    this.startAttract(0.6, 'lobby');
    const el = h('div', 'px');
    el.innerHTML = `<div class="pwait stone"><img class="skull" src="${UI}hd/skull.png" width="9" alt=""><span class="txt">${msg}</span><i class="dots"><b>.</b><b>.</b><b>.</b></i></div>`;
    this.set((dt) => this.attractUpdate(dt));
    this.layer.appendChild(el);
  }

  error(msg) {
    this.startAttract(0.6);
    const el = h('div', 'px');
    el.innerHTML = `<div class="pwait err stone"><span class="txt">${msg}</span></div>`;
    const back = () => this.go(() => this.mainMenu());
    const menu = new PixelMenu(el, [{ label: 'RETOUR', hint: 'au menu principal', act: back }], { crypt: this.crypt, top: 236 });
    this.set((dt) => { this.attractUpdate(dt); const ev = anyMenu(); menu.update(ev); if (ev.back) back(); });
    this.layer.appendChild(el);
  }

  // host: forward match messages; client: follow the host's phases
  hookHost() {
    const S = this.session;
    S.onDiag = (name, msg) => this.diagLine(name, msg);
    S.onHostMsg = (m, pid) => { if (this.match && this.match.onMessage) this.match.onMessage(m, pid); };
    S.onPeerLeft = (pid) => {
      if (S.lobby.tour) {
        const inDuel = S.lobby.slots.some((x) => x && x.pid && x.owner === pid);
        S.tourPeerLeft(pid);
        if (inDuel && S.lobby.phase !== 'tsetup' && S.lobby.phase !== 'tbracket') { this.stopMatch(); S.request({ k: 'tBack' }); }
        else S.changed();
        return;
      }
      if (this.match && this.match.peerLeft) { this.match.peerLeft(pid); return; }
      if (this.match && this.match.W) { /* their fighter stays as a CPU */ for (const F of this.match.W.list) { const slot = S.lobby.slots[F.slot]; if (!slot) F.bot = 2; } }
    };
  }

  // a guest's error, written at the bottom of the host's screen (so it can be sent to whoever fixes the game)
  diagLine(name, msg) {
    console.warn('[World of Bagarre] erreur chez ' + name + ' : ' + msg);
    let box = document.querySelector('.netdiag');
    if (!box) { box = h('div', 'netdiag'); this.app.ui.appendChild(box); }
    const line = h('div', '', '');
    line.textContent = name ? '⚠ Erreur chez ' + name + ' : ' + msg : '⚠ ' + msg; // no name: a plain notice
    box.appendChild(line);
    while (box.children.length > 4) box.firstChild.remove();
    clearTimeout(this.diagT);
    this.diagT = setTimeout(() => box.remove(), 30000);
  }

  hookClient() {
    const S = this.session;
    S.onHostLost = () => { this.stopMatch(); this.error('L\'hôte a quitté le salon.'); };
    S.onClientMsg = (m) => {
      if (m.t === 'start') this.clientStart(m.cfg);
      else if (m.t === 'results') { this.stopMatch(); this.results(m.r); }
      else if (m.t === 'goto') {
        if (m.to === 'charsel') { this.stopMatch(); this.charSelect(); }
        if (m.to === 'stagesel') this.stageSelect();
        if (m.to === 'tsetup') this.go(() => this.tourSetup());
        if (m.to === 'tbracket') this.go(() => { this.stopMatch(); this.tourBracket(); });
        if (m.to === 'tvs') this.go(() => this.tourVS(S.lobby.stage));
        if (m.to === 'tchamp') this.go(() => this.tourChamp());
      }
      else if (this.match && this.match.onMessage) this.match.onMessage(m, S.hostId()); // the match's own messages
    };
  }

  // a guest who just joined: wait for the room's state, then show its screen (a tournament or the character select)
  async clientRoute() {
    const S = this.session;
    if (!S.lobby.v) await new Promise((res) => { const off = S.onChange(() => { off(); res(); }); setTimeout(res, 3000); });
    const L = S.lobby;
    if (!L.tour) { this.charSelect(); return; }
    if (L.phase === 'tsetup') this.tourSetup();
    else if (L.phase === 'charsel') this.charSelect();
    else if (L.phase === 'tchamp') this.tourChamp();
    else this.tourBracket();
  }

  goto(to) { if (this.session && this.session.mode === 'host') this.session.net.broadcast({ t: 'goto', to }); }

  // ---- character select (pixel art over the 3D crypt slab, both on the 640x360 grid) --------------------------------
  charSelect() {
    this.stopAttract();
    const S = this.session, app = this.app;
    const show = new Showcase(app, 'cemetery');
    show.look = { y: 2.5, dist: 10 }; // closer, the fighters lower: the grid and the cards keep the top and the bottom
    this.music('charsel');
    const el = h('div', 'px charsel-px');
    // a duel of the tournament (src/ui/tournament.js): its two players only, no CPU, START goes to the VS screen
    const TT = S.lobby.tour, TD = TT && TT.cur ? matchById(TT, TT.cur) : null;
    if (TD) el.classList.add('cs-tour');
    el.innerHTML = `<i class="cs-vignette"></i>` + (TD ? `<div class="cs-title"><span>${roundName(TT, TD)}</span></div><div class="cs-duel"><b>${S.lobby.slots[0].name}</b><i>VS</i><b>${S.lobby.slots[1].name}</b></div>`
      : `<div class="cs-title"><span>CHOISIS</span> <b>TON BAGARREUR</b></div>`) +
      (S.lobby.code ? `<div class="cs-room"><small>SALON</small><b>${S.lobby.code}</b><i>${S.mode === 'host' ? 'donne ce code à tes potes' : 'connecté'}</i></div>` : '');
    const grid = h('div', 'cs-grid2');
    if (GRID_COLS > 7) { grid.style.transformOrigin = '0 0'; grid.style.transform = `scale(${7 / GRID_COLS})`; }
    CS_TILES.forEach((id, i) => {
      const t = h('div', 'cs-tile');
      t.style.left = (i % GRID_COLS) * 49 + 'px';
      t.style.top = Math.floor(i / GRID_COLS) * 49 + 'px';
      t.style.setProperty('--i', i);
      t.style.setProperty('--cc', id === 'random' ? '#9dff3a' : CHARS[id].color);
      // a comic panel in the fighter's color, the head popping out of its top, the name on an ink strip
      t.innerHTML = '<div class="ti"><i class="tb"></i>' + (id === 'random' ? '<b class="q">?</b><span class="nm"><em>HASARD</em></span>'
        : `<img src="assets/ui/portraits/${id}.png" alt=""><span class="nm"><em>${CHARS[id].name}</em></span>`) + '<i class="sh"></i></div>';
      // the mouse: a click picks it (and joins with the keyboard first when nobody plays on this PC yet)
      t.onclick = () => {
        const mine = () => { const k = S.slotOfDevice('kb1'); return k >= 0 ? k : S.mySlots()[0]; };
        if (mine() === undefined) { S.request({ k: 'join', dev: 'kb1', name: app.settings.name || padLabel('kb1') }); setTimeout(() => { if (mine() !== undefined) this.csPick(mine(), i); }, 80); return; }
        const sl = S.lobby.slots[mine()];
        if (sl && !sl.ready) this.csPick(mine(), i);
      };
      grid.appendChild(t);
    });
    el.appendChild(grid);
    const info = h('div', 'cs-info2');
    el.appendChild(info);
    const banner = h('div', 'cs-ready', '<i class="rb"></i><span>PRÊTS POUR LA BAGARRE !</span><small></small>');
    el.appendChild(banner);
    // the mouse: a click on the banner goes to the arena choice
    banner.onclick = () => { if (S.allReady() && (S.mode !== 'client' || S.mySlots().length)) { app.audio.sfx('menuOk'); S.request({ k: 'toStage' }); } };
    const fx = h('div', 'jx-layer'); // the bursts and the ink of the picks (src/ui/juice.js)
    el.appendChild(fx);
    const cards = h('div', 'cs-cards');
    el.appendChild(cards);
    // the keys of a pad and of the keyboard (ZQSD side), and the mouse
    const help = h('div', 'cs-help2 txt', TD ? '<b class="ka">A</b> prendre sa place / choisir · <b class="kb">B</b> annuler · <b>START</b> au combat' : '<b class="ka">A</b> / Entrée choisir · <b class="kb">B</b> / ⌫ annuler · <b class="ky">Y</b> / I + CPU · <b class="kx">X</b> / L − CPU · <b>START</b> / Entrée c\'est parti · clic sur une case vide : + CPU');
    el.appendChild(help);
    this.layer.innerHTML = '';
    this.layer.appendChild(el);
    const tiles = [...grid.children];
    requestAnimationFrame(() => tiles.forEach((t) => { const e = t.querySelector('.nm em'); if (e) fitText(e, 38); }));
    const lc = {}; // local cursors (instant on clients; the host gets them a few ms later)
    const was = []; // what each card showed last time (to animate only the changes)
    let lastInfo = null;
    const render = () => {
      const L = S.lobby;
      tiles.forEach((t) => { t.querySelectorAll('.cs-tok').forEach((c) => c.remove()); t.classList.remove('hot'); });
      L.slots.forEach((s, i) => {
        let c = cards.children[i];
        if (!c) { c = h('div', 'cs-card'); c.style.left = i * 158 + 'px'; c.style.setProperty('--pc', COLORS[i]); cards.appendChild(c); }
        if (TD && i >= 2) { c.style.display = 'none'; return; }
        const key = s ? [s.char, s.ready, s.cpu, s.name, s.dev].join('|') : '';
        if (was[i] !== key) {
          const before = was[i];
          was[i] = key;
          if (!s) {
            c.innerHTML = `<i class="cb"></i><b class="cj">J${i + 1}</b><span class="cw"${S.mode !== 'client' ? ' style="white-space:normal;line-height:9px;top:24px"' : ''}><b class="ka">A</b> POUR REJOINDRE${S.mode !== 'client' ? '<br>OU CLIC : + CPU' : ''}</span>`;
            // the mouse: an empty card joins with the keyboard when nobody plays on this PC, else it adds a CPU
            c.onclick = () => {
              if (!S.mySlots().length) { S.request({ k: 'join', dev: 'kb1', name: app.settings.name || padLabel('kb1') }); app.audio.sfx('menuOk'); }
              else if (S.mode !== 'client') { S.request({ k: 'cpu+' }); app.audio.sfx('menuOk'); }
            };
            c.oncontextmenu = null;
          }
          else {
            const ch = s.char ? CHARS[s.char] : null;
            const who = s.cpu ? `CPU · niveau ${s.cpu}` : s.pid && !s.dev ? (s.owner === S.me ? '<b class="ka">A</b> PRENDS UNE MANETTE' : 'SUR L’AUTRE PC…')
              : (s.owner === S.me ? padLabel(s.dev) : s.name);
            c.style.setProperty('--cc', ch ? ch.color : COLORS[i]);
            c.innerHTML = `<i class="cb"></i><div class="cp">${ch ? `<img src="assets/ui/portraits/${s.char}.png" alt="">` : '<b class="q">?</b>'}</div><b class="cj">${s.pid ? s.name : 'J' + (i + 1)}</b>
              <span class="cn"><em>${ch ? ch.name : '…'}</em></span><span class="cw">${who}</span>${s.ready ? '<b class="stamp">PRÊT !</b>' : ''}`;
            const nm = c.querySelector('.cn em');
            requestAnimationFrame(() => fitText(nm, 86));
            c.onclick = () => { if (s.cpu && S.mode !== 'client') { const k = (CHAR_ORDER.indexOf(s.char) + 1) % CHAR_ORDER.length; S.request({ k: 'cpuChar', slot: i, char: CHAR_ORDER[k] }); } };
            // right click on a CPU: it goes away
            c.oncontextmenu = (e) => { e.preventDefault(); if (s.cpu && S.mode !== 'client') { S.request({ k: 'leave', slot: i }); app.audio.sfx('menuBack'); } };
            // a new pick: the portrait slams in, the stamp falls, a comic burst and ink fly off the card
            if (s.ready && (!before || !before.split('|')[1] || before.split('|')[1] === 'false' || before.split('|')[0] !== s.char)) {
              c.classList.remove('slam'); void c.offsetWidth; c.classList.add('slam');
              const cx = 8 + i * 158 + 40, cy = 300;
              burst(fx, cx + 30, cy - 6, randomWord(), { color: ch ? ch.color : '#ffd400', size: s.cpu ? 54 : 74 });
              splash(fx, cx, cy + 10, ['#120a1a', ch ? ch.color : '#ffd400', '#fff3d6'], s.cpu ? 8 : 16, { speed: 50 });
              if (!s.cpu) { app.audio.sfx('stamp', 0, 0.5); this.uiShake(); }
            }
          }
          c.classList.toggle('used', !!s);
          c.classList.toggle('ready', !!(s && s.ready));
        }
        show.set(i, s && s.char ? s.char : null);
        if (s && !s.cpu && !s.ready) {
          const sc = s.owner === S.me && s.dev && lc[s.dev] !== undefined ? lc[s.dev] : s.cursor;
          if (tiles[sc]) {
            const tok = h('div', 'cs-tok', `<b>J${i + 1}</b>`);
            tok.style.setProperty('--pc', COLORS[i]);
            tok.style.left = (i % 2) * 26 - 6 + 'px';
            tok.style.top = Math.floor(i / 2) * 26 - 8 + 'px';
            tiles[sc].appendChild(tok);
            if (!tiles[sc].classList.contains('hot')) tiles[sc].style.setProperty('--pc', COLORS[i]);
            tiles[sc].classList.add('hot');
          }
        }
      });
      // info: the character under the first local cursor
      const mine = S.mySlots();
      const cs = mine.length ? L.slots[mine[0]] : null;
      const id = cs ? (cs.ready ? cs.char : CS_TILES[lc[cs.dev] ?? cs.cursor]) : null;
      if (id !== lastInfo) {
        lastInfo = id;
        // a comic poster of the fighter under the cursor: the bust big behind, the name slammed on it, the title in a
        // yellow caption, the four specials
        if (id && id !== 'random') {
          const d = CHARS[id], sp = d.specialsInfo;
          info.style.setProperty('--cc', d.color);
          info.innerHTML = `<i class="ib"></i><img class="ci-p" src="assets/ui/portraits/${id}.png" alt=""><div class="ci-n"><em>${d.name}</em></div><div class="ci-t">${d.title}</div>
            <div class="ci-sp"><div class="ci-s"><b class="kx">X</b><i>•</i>${sp.n}</div><div class="ci-s"><b class="kx">X</b><i>→</i>${sp.s}</div><div class="ci-s"><b class="kx">X</b><i>↑</i>${sp.u}</div><div class="ci-s"><b class="kx">X</b><i>↓</i>${sp.d}</div></div>`;
          fitText(info.querySelector('.ci-n em'), 168);
          info.classList.remove('flip'); void info.offsetWidth; info.classList.add('flip');
        } else {
          info.style.setProperty('--cc', '#9dff3a');
          info.innerHTML = '<i class="ib"></i>' + (id === 'random' ? '<div class="ci-n"><em>AU HASARD</em></div><div class="ci-t">Le cimetière choisira pour toi.</div>' : '<div class="ci-n ci-wait"><em>QUI OSE ?</em></div><div class="ci-t">Appuie sur A pour rejoindre la bagarre.</div>');
        }
      }
      const ready = S.allReady();
      if (ready !== banner.classList.contains('on')) {
        banner.classList.toggle('on', ready);
        banner.style.pointerEvents = ready ? 'auto' : ''; // clickable only while it is shown (hidden, it must not cover the grid)
        banner.style.cursor = ready ? 'pointer' : '';
        if (ready) { app.audio.sfx('go', 0, 0.6); this.uiShake(); lines(fx, 320, 205, { n: 22, len: 160 }); flash(fx, '#fff3d6', 0.35); }
      }
      banner.querySelector('small').textContent = TD ? 'START ou A : AU COMBAT !' : S.mode !== 'client' || S.mySlots().length ? 'START ou A : choisir l\'arène' : 'un joueur va lancer la bagarre…';
    };
    const off = S.onChange(() => render());
    render();
    if (S.mode !== 'client') S.request({ k: 'phase', phase: 'charsel' });
    const leave = (fn) => { off(); this.go(() => { show.dispose(); fn(); }); };
    this.set((dt) => {
      show.update(dt);
      const L = S.lobby;
      for (const d of Input.list()) {
        if (inputLock) break;
        let m = d.menu;
        // Échap (keyboard) is START and back at once: on this screen it goes back, it never joins nor launches
        if (m.start && m.back) m = { ...m, start: 0 };
        const slot = S.slotOfDevice(d.id);
        if (slot < 0 && TD) {
          // a duel of the tournament: a pad of this machine takes the place of one of its players
          if (m.confirm || m.start) { const k = L.slots.findIndex((x) => x && x.pid && x.owner === S.me && !x.dev); if (k >= 0) { S.request({ k: 'tClaim', slot: k, dev: d.id }); app.audio.sfx('menuOk'); } }
          if (m.back && S.mode !== 'client' && !L.slots.some((x) => x && x.dev)) { app.audio.sfx('menuBack'); off(); S.request({ k: 'tBack' }); return; }
          continue;
        }
        if (slot < 0) {
          // the host without a fighter can still launch (it then only watches)
          if (m.start && S.mode !== 'client' && S.allReady()) { app.audio.sfx('menuOk'); S.request({ k: 'toStage' }); return; }
          if (m.confirm || m.start) { S.request({ k: 'join', dev: d.id, name: (!S.mySlots().length && app.settings.name) || padLabel(d.id) }); app.audio.sfx('menuOk'); }
          if (m.back && S.mySlots().length === 0) { app.audio.sfx('menuBack'); leave(() => this.mainMenu()); return; }
          continue;
        }
        const s = L.slots[slot];
        if (!s) continue;
        if (!s.ready) {
          const c0 = lc[d.id] ?? s.cursor;
          let c = c0;
          if (m.left) c = (c + CS_TILES.length - 1) % CS_TILES.length;
          if (m.right) c = (c + 1) % CS_TILES.length;
          if (m.up) c = (c + CS_TILES.length - GRID_COLS) % CS_TILES.length;
          if (m.down) c = (c + GRID_COLS) % CS_TILES.length;
          if (c !== c0) { lc[d.id] = c; S.request({ k: 'cursor', slot, c }); app.audio.sfx('menuMove'); render(); }
          if (m.confirm) this.csPick(slot, c);
          if (m.back) { S.request({ k: TD ? 'tUnclaim' : 'leave', slot }); app.audio.sfx('menuBack'); }
        } else {
          if (m.back) { S.request({ k: 'pick', slot, char: null }); app.audio.sfx('menuBack'); }
          if ((m.start || m.confirm) && S.allReady()) { app.audio.sfx('menuOk'); S.request({ k: 'toStage' }); return; }
        }
        if (S.mode !== 'client' && !TD) {
          if (m.y) { S.request({ k: 'cpu+' }); app.audio.sfx('menuOk'); }
          if (m.x) { S.request({ k: 'cpu-' }); app.audio.sfx('menuBack'); }
        }
      }
    }, () => { off(); show.dispose(); });
    this.layer.appendChild(el);
    this.csShow = show;
  }

  // a small shake of the whole interface (a stamp, a pick)
  uiShake() { const u = this.app.ui; u.classList.remove('shake'); void u.offsetWidth; u.classList.add('shake'); }

  csPick(slot, cursor) {
    const S = this.session;
    let id = CS_TILES[cursor];
    if (id === 'random') id = CHAR_ORDER[Math.floor(Math.random() * CHAR_ORDER.length)];
    S.request({ k: 'pick', slot, char: id });
    this.app.audio.sfx('menuOk');
    if (!this.app.audio.playFile('choose_' + id, 1.3, 0, 'choose')) this.app.audio.say(CHARS[id].name + ' !', 0.5, 1.05); // the voice recorded in assets/sfx/choose_<fighter>.ogg, else the speech synthesis
    if (this.csShow) setTimeout(() => this.csShow && this.csShow.set(slot, id, true), 30);
  }

  // ---- stage & rules ----------------------------------------------------------------------------------------------
  // the arena's painted thumbnail (Codex: tools/art/wob.ps1, assets/ui/stages/<id>.jpg); a render of its 3D scene only
  // for an arena that has none yet
  stageThumb(id) {
    if (PAINTED_THUMBS.has(id)) return `assets/ui/stages/${id}.jpg`;
    if (this.thumbs[id]) return this.thumbs[id];
    const TW = 330, TH = 186; // 3 times its size on the 640x360 grid (sharp on a 1080p screen)
    const R = this.app.renderer;
    const scene = new THREE.Scene();
    const v = buildStageView(STAGES[id]);
    scene.add(v.group);
    scene.fog = new THREE.Fog(v.fog[0], v.fog[1], v.fog[2]);
    scene.background = new THREE.Color(v.bg);
    const W = new World({ stage: id, roster: [], rules: {} });
    syncStageView(v, W.stage);
    if (v.update) v.update(0.016, 3, W.stage, W);
    const cam = new THREE.PerspectiveCamera(42, 16 / 9, 0.3, 400);
    cam.position.set(0, 12, 20); cam.lookAt(0, -1, 0);
    const rt = new THREE.WebGLRenderTarget(TW, TH);
    R.gl.setRenderTarget(rt); R.gl.render(scene, cam); R.gl.setRenderTarget(null);
    const px = new Uint8Array(TW * TH * 4);
    R.gl.readRenderTargetPixels(rt, 0, 0, TW, TH, px);
    const c = document.createElement('canvas'); c.width = TW; c.height = TH;
    const g = c.getContext('2d'), img = g.createImageData(TW, TH);
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
      const s = ((TH - 1 - y) * TW + x) * 4, d = (y * TW + x) * 4;
      for (let k = 0; k < 3; k++) { const lin = px[s + k] / 255; img.data[d + k] = 255 * (lin <= 0.0031308 ? lin * 12.92 : 1.055 * Math.pow(lin, 1 / 2.4) - 0.055); }
      img.data[d + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    rt.dispose();
    scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.thumbs[id] = c.toDataURL();
    return this.thumbs[id];
  }

  stageSelect() {
    const S = this.session, app = this.app;
    if (S.mode === 'host') this.goto('stagesel');
    if (S.mode !== 'client') S.request({ k: 'phase', phase: 'stagesel' });
    this.startAttract(0.65, 'charsel');
    const el = h('div', 'px stagesel-px');
    el.innerHTML = '<i class="cs-vignette"></i><div class="cs-title"><span>CHOISIS</span> <b>L\'ARÈNE</b></div>';
    const grid = h('div', 'ss-grid2');
    const all = [...STAGE_ORDER, 'random'];
    const SS_COLS = 6, SS_PITCH = 101; // 6 par ligne : 11 cases tiennent sur deux lignes (la 3e cachait « AU HASARD » sous la légende)
    all.forEach((id, i) => {
      const t = h('div', 'ss-tile');
      t.style.left = (i % SS_COLS) * SS_PITCH + 'px';
      t.style.top = Math.floor(i / SS_COLS) * 76 + 'px';
      t.style.setProperty('--i', i);
      t.style.setProperty('--r', ((i * 7) % 5 - 2) * 0.8 + 'deg'); // comic panels pinned a little askew
      // a comic panel: ink frame, the arena's picture, its name on a caption strip
      t.innerHTML = '<div class="ti">' + (id === 'random' ? '<b class="q">?</b><span class="nm">AU HASARD</span>'
        : `<img src="${this.stageThumb(id)}" width="92" height="50" alt="" style="object-fit:cover"><span class="nm"><em>${STAGES[id].name}</em></span>`) + '</div>';
      t.onclick = () => { if (S.choosing()) { cursor = i; S.request({ k: 'stage', stage: id, cursor: i }); go(); } };
      grid.appendChild(t);
    });
    el.appendChild(grid);
    requestAnimationFrame(() => [...grid.querySelectorAll('.nm em')].forEach((e) => fitText(e, 88)));
    const blurb = h('div', 'ss-blurb2 stone');
    el.appendChild(blurb);
    const rulesEl = h('div', 'ss-rules2');
    el.appendChild(rulesEl);
    const help = h('div', 'cs-help2 txt ss-help');
    el.appendChild(help);
    const fx = h('div', 'jx-layer');
    el.appendChild(fx);
    let cursor = Math.max(0, S.lobby.stageCursor || 0);
    let row = 0; // 0 = the arenas, 1 = the rules (a line of chips: left / right picks one, A changes it)
    let rc = 0; // the rule picked on that line
    let downPrev = true; // entering the rules needs a fresh press down (not the auto repeat of a held stick, nor one held on arrival)
    let shown = -1;
    const R = () => S.lobby.rules;
    const ruleItems = [
      { label: 'MODE', val: () => (R().mode === 'stock' ? 'Vies' : 'Chrono'), ch: () => ({ mode: R().mode === 'stock' ? 'time' : 'stock' }) },
      { label: 'VIES', val: () => R().stocks, ch: (d) => ({ stocks: ((R().stocks - 1 + d + 9) % 9) + 1 }) },
      { label: 'CHRONO', val: () => Math.round(R().time / 60) + ' min', ch: (d) => ({ time: (((Math.round(R().time / 60) - 1 + d + 10) % 10) + 1) * 60 }) },
      { label: 'PIÈGES', val: () => (R().hazards ? 'Oui' : 'Non'), ch: () => ({ hazards: !R().hazards }) },
      { label: 'MINI-JEUX', val: () => (R().minigames !== false ? 'Oui' : 'Non'), ch: () => ({ minigames: R().minigames === false }) },
      { label: 'ULTIMES', val: () => (R().ult !== false ? 'Oui' : 'Non'), ch: () => ({ ult: R().ult === false }) },
      { label: 'NIVEAU CPU', val: () => ['', 'Facile', 'Normal', 'Brutal'][R().cpuLevel || 2], ch: (d) => ({ cpuLevel: (((R().cpuLevel || 2) - 1 + d + 3) % 3) + 1 }) },
    ];
    const render = () => {
      const cur = S.choosing() ? cursor : S.lobby.stageCursor;
      // the arena keeps its frame while the rules are being set (dimmer): the screen never loses its cursor
      [...grid.children].forEach((t, i) => t.classList.toggle('on', i === cur));
      grid.classList.toggle('away', row > 0);
      if (cur !== shown) {
        shown = cur;
        const id = all[cur];
        blurb.innerHTML = '<small>LIEU DU CRIME :</small>' + (id && id !== 'random' ? `<b>${STAGES[id].name}</b><span>${STAGES[id].blurb}</span>` : '<b>AU HASARD</b><span>Le destin choisira ton ring.</span>');
        if (row === 0) { const t = grid.children[cur]; if (t) { t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop'); } }
        blurb.classList.remove('flip'); void blurb.offsetWidth; blurb.classList.add('flip');
      }
      const rules = ruleItems.map((r, i) => `<div class="ss-rule${row === 1 && rc === i ? ' on' : ''}" data-i="${i}"><small>${r.label}</small><span><img src="${UI}hd/arrow_l.png" width="8" alt=""><b>${r.val()}</b><img src="${UI}hd/arrow_r.png" width="8" alt=""></span></div>`).join('');
      if (rules !== lastRules) { rulesEl.innerHTML = rules; lastRules = rules; } // only when it changes (not every frame)
      const who = S.lobby.slots.find((x) => x && !x.cpu && x.owner === S.lobby.chooser);
      const hl = row === 0 ? '<b class="ka">A</b> / Entrée lancer le combat · <b class="kb">B</b> / Échap retour · <b>↓</b> les règles · clic : lancer, changer une règle'
        : '<b>←→</b> choisir · <b class="ka">A</b> / Entrée changer · <b class="kx">X</b> / L en arrière · <b>↑</b> les arènes · <b>START</b> lancer · clic : changer';
      if (S.choosing()) { if (help.innerHTML !== hl) help.innerHTML = hl; }
      else help.textContent = (who ? who.name : 'L\'hôte') + ' choisit l\'arène…';
    };
    let lastRules = '';
    // the mouse: a rule chip clicked changes it
    rulesEl.onclick = (e) => { const c = e.target.closest('.ss-rule'); if (!c || !S.choosing()) return; row = 1; rc = +c.dataset.i; S.request({ k: 'rules', rules: ruleItems[rc].ch(1) }); app.audio.sfx('menuMove'); render(); };
    const off = S.onChange(render);
    render();
    const go = () => {
      let id = all[cursor];
      if (id === 'random') id = STAGE_ORDER[Math.floor(Math.random() * STAGE_ORDER.length)];
      S.request({ k: 'stage', stage: id, cursor });
      Object.assign(app.settings, { mode: R().mode, stocks: R().stocks, time: R().time, hazards: R().hazards, minigames: R().minigames !== false, ult: R().ult !== false, cpuLevel: R().cpuLevel });
      app.saveSettings();
      const t = grid.children[cursor];
      if (t) {
        t.classList.remove('pick'); void t.offsetWidth; t.classList.add('pick');
        const x = 16 + (cursor % SS_COLS) * SS_PITCH + SS_PITCH / 2 - 3, y = 46 + Math.floor(cursor / SS_COLS) * 76 + 34;
        burst(fx, x, y, 'BASTON !', { color: '#e8202e', text: '#fff3d6', size: 110, life: 800 });
        lines(fx, x, y, { n: 20, len: 150 }); flash(fx, '#fff3d6', 0.4); this.uiShake();
      }
      S.request({ k: 'launch', stage: id }); // the host starts it (lobbyCmd)
    };
    this.set((dt) => {
      this.attractUpdate(dt);
      if (!S.choosing() || inputLock) return;
      const ev = anyMenu();
      if (ev.start && ev.back) ev.start = 0; // Échap (keyboard) is START and back at once: here, back (never a launch)
      // a fresh press: the stick (or the D-pad) was not held down on the frame before
      const downNow = Input.list().some((d) => d.menuHeld && d.menuHeld.dir === 'down');
      const fresh = ev.down && !downPrev;
      downPrev = downNow;
      let moved = false;
      if (row === 0) {
        let c = cursor;
        if (ev.left) c = (c + all.length - 1) % all.length;
        if (ev.right) c = (c + 1) % all.length;
        if (ev.up) c = (c + all.length - SS_COLS) % all.length;
        if (ev.down) { if (c + SS_COLS < all.length) c += SS_COLS; else if (fresh) { row = 1; moved = true; app.audio.sfx('menuMove'); } }
        if (c !== cursor) { cursor = c; moved = true; S.request({ k: 'stage', stage: all[c] === 'random' ? S.lobby.stage : all[c], cursor: c }); app.audio.sfx('menuMove'); }
        if (ev.confirm || ev.start) { app.audio.sfx('menuOk'); go(); return; }
      } else {
        // the line of rules: left / right picks a rule, A changes it (X back), up returns to the arenas
        if (ev.left) { rc = (rc + ruleItems.length - 1) % ruleItems.length; moved = true; app.audio.sfx('menuMove'); }
        if (ev.right) { rc = (rc + 1) % ruleItems.length; moved = true; app.audio.sfx('menuMove'); }
        if (ev.up) { row = 0; moved = true; app.audio.sfx('menuMove'); }
        if (ev.confirm || ev.x) {
          S.request({ k: 'rules', rules: ruleItems[rc].ch(ev.x ? -1 : 1) }); app.audio.sfx('menuMove'); moved = true;
          const chip = rulesEl.children[rc];
          if (chip) { chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump'); }
        }
        if (ev.start) { app.audio.sfx('menuOk'); go(); return; }
      }
      if (ev.back) { moved = true; if (row > 0) { row = 0; } else { app.audio.sfx('menuBack'); S.request({ k: 'toChars' }); return; } }
      if (moved) render();
    }, () => off());
    this.layer.appendChild(el);
  }

  // ---- matches ------------------------------------------------------------------------------------------------------
  stopMatch() { if (this.match) { this.match.dispose(); this.match = null; } }

  matchConfig(stage) {
    const S = this.session;
    const L = S.lobby;
    const names = {};
    L.slots.forEach((s, i) => { if (s) names[i] = s.cpu ? 'CPU' : s.name; });
    const T = L.tour, TM = T && T.cur ? matchById(T, T.cur) : null;
    return { stage, rules: { ...L.rules }, seed: (Math.random() * 1e9) | 0, names, round: TM ? roundName(T, TM) : null, roster: S.roster().map((r) => ({ slot: r.slot, char: r.char, bot: r.bot, name: r.name })) };
  }

  // the VS screen while a match loads (src/ui/versus.js): the players' names, their characters face to face
  versus(cfg) {
    const players = cfg.roster.map((r) => ({ name: (cfg.names && cfg.names[r.slot]) || r.name || 'J' + (r.slot + 1), char: r.char, color: COLORS[r.slot] || '#ffffff', cpu: !!r.bot }));
    return new Versus(this.app, this.layer, { players, stage: cfg.stage, round: cfg.round });
  }
  // one frame of it: the match starts once ready and shown for 3 s (the host decides online: Versus waits for 'rgo')
  versusStep(m, vs, dt) {
    if (!vs || vs.done) return;
    vs.update(dt);
    if (m.loading) {
      if (vs.t >= 3 && m.canGo && m.canGo()) m.go();
      else if (vs.t >= 3 && m.othersPending) vs.waiting(m.othersPending());
    } else vs.exit();
  }

  startMatch(stage) {
    this.stopMatch(); // never two matches at once (the old one's fighters would stay on the stage, frozen)
    this.stopAttract();
    const S = this.session, app = this.app;
    S.request({ k: 'phase', phase: 'match' });
    const cfg = this.matchConfig(stage);
    this.lastCfg = cfg;
    const roster = S.roster().map((r) => ({ ...r }));
    // online: rollback (every machine runs the match), unless ?netmode=snap (the old way: the host sends pictures)
    if (S.mode === 'host' && app.params.get('netmode') !== 'snap') {
      cfg.rb = 1;
      cfg.delay = Math.max(1, Math.min(6, +(app.params.get('idelay') || 2)));
      S.net.broadcast({ t: 'start', cfg });
      this.runRollback(cfg);
      return;
    }
    let snapT = 0;
    const onTick = S.mode === 'host' ? (W) => {
      const now = performance.now();
      if (W.events.length) S.net.broadcast({ t: 'ev', h: now, l: W.events.slice() });
      if (++snapT % 2 === 0) S.sendSnap({ t: 'snap', h: now, s: W.snapshot() });
    } : null;
    if (S.mode === 'host') S.net.broadcast({ t: 'start', cfg });
    const loading = S.mode === 'local'; // (the old picture mode online starts at once: its guests only watch pictures)
    const m = new LocalMatch(app, { stage, roster, rules: cfg.rules, seed: cfg.seed, names: cfg.names, onTick, remoteInputs: S.remoteInputs, loading });
    this.match = m;
    window.__match = m;
    this.layer.innerHTML = '';
    this.pauseUI(m);
    m.onOver = (W) => this.finishMatch(W); // straight after the slow motion of the last KO
    let vs = null;
    this.set((dt) => { m.update(dt); this.versusStep(m, vs, dt); if (!m.loading) this.pauseUpdate(m); }, () => { if (vs) vs.dispose(); });
    if (loading) vs = this.versus(cfg);
  }

  clientStart(cfg) {
    this.stopAttract();
    this.stopMatch();
    this.launchAt = 0;
    if (this.csShow) { this.csShow.dispose(); this.csShow = null; }
    if (cfg.rb) { this.runRollback(cfg); return; }
    const m = new ClientMatch(this.app, this.session, cfg);
    this.match = m;
    window.__match = m;
    this.layer.innerHTML = '';
    this.set((dt) => { m.update(dt); this.netMenuUpdate(m); }, () => { this.pauseEl = null; });
  }

  // an online match with rollback, host or guest (the host decides when it is over)
  runRollback(cfg) {
    this.stopMatch();
    const m = new RollbackMatch(this.app, this.session, cfg, { loading: true });
    this.lastCfg = cfg;
    this.match = m;
    window.__match = m;
    this.layer.innerHTML = '';
    if (this.session.mode === 'host') m.onOver = (W) => this.finishMatch(W);
    else m.onDropped = () => { this.stopMatch(); this.session.close(); this.error('La connexion avec l\'hôte a coupé trop longtemps : l\'ordinateur a pris ton perso.'); };
    let vs = null;
    this.set((dt) => { m.update(dt); this.versusStep(m, vs, dt); if (!m.loading) this.netMenuUpdate(m); }, () => { this.pauseEl = null; if (vs) vs.dispose(); });
    vs = this.versus(cfg);
  }

  finishMatch(W) {
    const r = W.list.map((F) => ({ slot: F.slot, char: F.char, place: F.place, stocks: Math.max(0, F.stocks), kos: F.stats.kos, falls: F.stats.falls, sd: F.stats.sd, dealt: Math.round(F.stats.dealt), taken: Math.round(F.stats.taken), bot: F.bot, name: (this.lastCfg && this.lastCfg.names[F.slot]) || '' }))
      .sort((a, b) => a.place - b.place);
    const blood = Math.round(r.reduce((s, x) => s + x.taken, 0) * 0.05 * 10) / 10;
    const res = { r, blood, stage: W.stageId };
    if (this.session && this.session.lobby.tour && this.session.mode !== 'client') {
      const T = this.session.lobby.tour, M = T.cur && matchById(T, T.cur);
      if (M) res.tour = { round: roundName(T, M), final: !M.third && M.r === T.rounds.length - 1 };
      this.session.tourReport(res);
      this.tourSave && this.tourSave();
    }
    if (this.session && this.session.mode === 'host') this.session.net.broadcast({ t: 'results', r: res });
    if (this.session && this.session.mode !== 'client') this.session.request({ k: 'phase', phase: 'results' });
    this.stopMatch();
    this.results(res);
  }

  // pause (Start during a local/host match)
  pauseUI(m) {
    this.pauseEl = null;
    this.pauseMenu = null;
  }
  pauseUpdate(m) {
    const ev = anyMenu();
    if (!this.pauseEl) {
      if (ev.start && this.session.mode === 'local') {
        m.paused = true;
        this.app.audio.sfx('menuOk');
        this.pauseEl = h('div', 'px ppause');
        this.pauseEl.innerHTML = '<div class="pdim"></div><div class="ptitle txt">PAUSE</div>';
        const leave = (fn) => { this.pauseEl.remove(); this.pauseEl = null; this.go(() => { m.paused = false; this.stopMatch(); fn(); }); }; // stays paused under the falling door
        this.pauseMenu = new PixelList(this.pauseEl, [
          { label: 'Reprendre', act: () => this.unpause(m) },
          { label: 'Recommencer', act: () => leave(() => this.startMatch(this.lastCfg.stage)) },
          { label: 'Changer de bagarreur', act: () => leave(() => this.charSelect()) },
          { label: 'Quitter', act: () => leave(() => this.mainMenu()) },
        ], { left: 210, top: 120, width: 220 });
        this.layer.appendChild(this.pauseEl);
      }
      return;
    }
    this.pauseMenu.update(ev);
    if (ev.start || ev.back) this.unpause(m);
  }
  unpause(m) { m.paused = false; if (this.pauseEl) this.pauseEl.remove(); this.pauseEl = null; }

  // online: Start opens a menu over the match (it goes on for the others; this machine's fighters stand still)
  netMenuUpdate(m) {
    const S = this.session, ev = anyMenu();
    const close = () => { if (m.block) m.block(false); if (this.pauseEl) this.pauseEl.remove(); this.pauseEl = null; };
    if (!this.pauseEl) {
      if (!ev.start) return;
      this.app.audio.sfx('menuOk');
      if (m.block) m.block(true);
      this.pauseEl = h('div', 'px ppause');
      this.pauseEl.innerHTML = '<div class="pdim"></div><div class="ptitle txt">MENU</div>';
      const leaveRoom = () => { close(); this.go(() => { this.stopMatch(); S.close(); this.mainMenu(); }); };
      const items = [{ label: 'Reprendre', act: close }];
      // the host can stop the match for everybody: back to the character select
      if (S.mode === 'host') items.push({ label: 'Arrêter le match', act: () => { close(); this.go(() => { this.stopMatch(); this.goto('charsel'); this.charSelect(); }); } });
      items.push({ label: 'Quitter le salon', act: leaveRoom });
      this.pauseMenu = new PixelList(this.pauseEl, items, { left: 210, top: 120, width: 220 });
      this.layer.appendChild(this.pauseEl);
      return;
    }
    this.pauseMenu.update(ev);
    if (ev.start || ev.back) close();
  }

  // ---- results ---------------------------------------------------------------------------------------------------
  results(res) {
    const S = this.session, app = this.app;
    // the cover of a horror comic: the winner dances on the crypt slab in 3D with a music video camera on him (left),
    // the masthead, VICTOIRE slammed letter by letter, his name, the ranking panels, the blood spilt, the menu (right)
    this.stopAttract();
    const w0 = res.r[0], C0 = CHARS[w0.char];
    const show = new Showcase(app, 'cemetery');
    this.resShow = show;
    show.set(0, w0.char);
    show.emote(0, (EMOTES[w0.char] && EMOTES[w0.char].win.emote) || 'victory_celebration', true);
    show.startVictoryCam(-4.2, 0.6);
    this.music('victory');
    const el = h('div', 'px rs-px');
    el.style.setProperty('--cc', C0.color);
    const HEAD = ['{W} A TOUT MASSACRÉ !', 'LA NUIT OÙ {W} A TOUT CASSÉ', '{W}, LA TERREUR DES TOMBES', 'IL EST REVENU D’ENTRE LES MORTS… POUR GAGNER',
      '{W} RÈGNE SUR LE CIMETIÈRE', 'ILS ONT OSÉ DÉFIER {W}…', 'PERSONNE N’A SURVÉCU À {W}'];
    let headline = HEAD[(Math.random() * HEAD.length) | 0].replace('{W}', C0.name.toUpperCase());
    if (res.tour && res.r[1]) headline = `${(w0.name || C0.name).toUpperCase()} ÉLIMINE ${(res.r[1].name || CHARS[res.r[1].char].name).toUpperCase()} EN ${res.tour.round}`;
    const issue = 100 + ((Math.random() * 566) | 0);
    const V = 'VICTOIRE !';
    const PL = ['1<sup>ER</sup>', '2<sup>E</sup>', '3<sup>E</sup>', '4<sup>E</sup>'];
    el.innerHTML = `<i class="rs-cover"></i>
      <div class="rs-mast"><img src="${WOB}logo_s.png" width="128" alt="World of Bagarre"><span>N° ${issue} · ÉDITION SPÉCIALE · 0,50 F</span></div>
      <div class="rs-head"><small>À LA UNE :</small><b>${headline}</b></div>
      <div class="rs-title">${[...V].map((c, i) => `<b style="--i:${i}">${c === ' ' ? '&nbsp;' : c}</b>`).join('')}</div>
      <div class="rs-win"><span><em>${C0.name}</em></span><small>${w0.name || 'J' + (w0.slot + 1)} · ${res.tour ? (res.tour.final ? 'CHAMPION DU TOURNOI' : 'QUALIFIÉ POUR LA SUITE') : 'CHAMPION DU CIMETIÈRE'}</small></div>`;
    const rows = h('div', 'rs-rows');
    rows.innerHTML = res.r.map((x, i) => `<div class="rs-row p${Math.min(4, x.place)}" style="--i:${i};--pc:${COLORS[x.slot]};--cc:${CHARS[x.char].color}"><i class="rb"></i>
      <b class="pl">${PL[Math.min(3, x.place - 1)]}</b>
      <div class="rp"><img src="assets/ui/portraits/${x.char}.png" alt=""></div>
      <span class="rn"><em>${CHARS[x.char].name}</em><small>${x.name || 'J' + (x.slot + 1)}</small></span>
      <span class="rst">ÉJECTIONS <b data-n="${x.kos}">0</b></span><span class="rst">CHUTES <b data-n="${x.falls}">0</b></span><span class="rst">DÉGÂTS <b data-n="${x.dealt}" data-s="%">0</b></span></div>`).join('');
    el.appendChild(rows);
    el.appendChild(h('div', 'rs-blood', `HÉMOGLOBINE RÉPANDUE : <b data-n="${res.blood}" data-s=" L" data-d="1">0</b>`));
    const fx = h('div', 'jx-layer');
    el.appendChild(fx);
    // what comes next: the host decides, and the guest who chose the arena too
    const next = [
      { label: 'Revanche !', act: () => S.request({ k: 'launch', stage: S.mode === 'client' ? S.lobby.stage : this.lastCfg.stage }) },
      { label: 'Changer de bagarreur', act: () => S.request({ k: 'toChars' }) },
      { label: 'Changer d’arène', act: () => S.request({ k: 'toStage' }) },
    ];
    const quit = { label: S.mode === 'client' ? 'Quitter le salon' : 'Menu principal', act: () => this.go(() => this.mainMenu()) };
    let items = S.mode !== 'client' || S.lobby.chooser === S.me ? [...next, quit] : [{ label: 'Attendre la suite…', act: () => {} }, quit];
    if (res.tour) items = S.mode !== 'client' ? [{ label: res.tour.final ? 'Le champion !' : 'Suite du tournoi', act: () => S.request({ k: 'tBack' }) }] : [{ label: 'L’hôte va continuer…', act: () => {} }];
    const menu = new PixelList(el, items, { left: 412, top: 270, width: 216 });
    menu.el.classList.add('rs-menu');
    requestAnimationFrame(() => { fitText(el.querySelector('.rs-win em'), 270); el.querySelectorAll('.rs-row .rn em').forEach((e) => fitText(e, 92)); });
    // every cut of the camera: a flash of light and a jolt
    show.onCut = () => { flash(fx, '#fff3d6', 0.22); this.uiShake(); };
    // the beats of the entrance (seconds): the name slams with a burst, ink and speed lines
    const beats = [
      [0.05, () => { flash(fx, '#ffffff', 0.7); lines(fx, 140, 200, { n: 26, len: 220, life: 600 }); }],
      [0.98, () => {
        burst(fx, 470, 70, 'VICTOIRE !', { color: C0.color, size: 128, life: 900 });
        splash(fx, 470, 80, ['#120a1a', C0.color, '#fff3d6', '#e8202e'], 22, { speed: 90, size: 4 });
        app.audio.sfx('stamp', 0, 0.7); this.uiShake();
      }],
      [1.6, () => app.audio.say('Victoire ! ' + C0.name, 0.45, 0.95)],
      [1.75, () => splash(fx, 500, 262, ['#e8202e', '#8a0010', '#120a1a'], 18, { speed: 40, size: 3.5 })],
    ];
    const nums = [...el.querySelectorAll('[data-n]')];
    let t = 0;
    this.set((dt) => {
      if (this.resShow) this.resShow.update(dt);
      t += dt;
      while (beats.length && t >= beats[0][0]) beats.shift()[1]();
      nums.forEach((b, i) => {
        const k = Math.max(0, Math.min(1, (t - 1.4 - i * 0.05) / 0.7)), n = +b.dataset.n;
        const v = b.dataset.d ? (n * k).toFixed(1).replace('.', ',') : Math.round(n * k);
        const txt = v + (b.dataset.s || '');
        if (b.textContent !== txt) { b.textContent = txt; if (k < 1 && Math.random() < 0.3) app.audio.sfx('click', 0, 0.15); }
      });
      const ev = anyMenu();
      if (t > 1.2) menu.update(ev);
    });
    this.layer.appendChild(el);
  }

  // ---- le bar : on s'y promène avec son perso, on parle aux potes et on trinque (src/ui/bar.js) ----------------------
  bar() {
    this.stopAttract();
    this.music('bar');
    let bar = null;
    this.set((dt) => bar && bar.update(dt), () => bar && bar.dispose());
    bar = new Bar(this.app, this.layer, { onExit: () => { this.app.audio.sfx('menuBack'); this.go(() => this.mainMenu()); } });
    window.__bar = bar;
  }

  // ---- options & help ---------------------------------------------------------------------------------------------
  options() {
    const app = this.app, s = app.settings;
    this.startAttract(0.6, 'options');
    const el = h('div', 'px');
    el.innerHTML = '<div class="ptitle txt">OPTIONS</div>';
    const vol = (k, label) => ({ label, bar: () => s.volume[k], val: () => Math.round(s.volume[k] * 10), left: () => { s.volume[k] = Math.max(0, +(s.volume[k] - 0.1).toFixed(1)); app.saveSettings(); }, right: () => { s.volume[k] = Math.min(1, +(s.volume[k] + 0.1).toFixed(1)); app.saveSettings(); app.audio.sfx('hitM'); } });
    const bloodNames = ['Aucune', 'Ketchup', 'Beaucoup', 'À FOISON'];
    // the pixel filter (big sharp pixels and dithering on the 3D, menus and fights alike): applied at once
    const pix = [[0, 'Non'], [360, 'Gros pixels (360p)'], [540, 'Moyen (540p)'], [720, 'Fin (720p)']];
    const pixIdx = () => Math.max(0, pix.findIndex((p) => p[0] === (s.pixel || 0)));
    const setPix = (i) => { s.pixel = pix[(i + pix.length) % pix.length][0]; app.saveSettings(); };
    const toggle = (get, set) => ({ val: () => (get() ? 'Oui' : 'Non'), left: () => { set(!get()); app.saveSettings(); }, right: () => { set(!get()); app.saveSettings(); } });
    const back = () => { this.app.audio.sfx('menuBack'); this.go(() => this.mainMenu()); };
    const menu = new PixelList(el, [
      vol('master', 'Volume général'), vol('music', 'Musique'), vol('sfx', 'Effets'), vol('voice', 'Annonceur'),
      { label: 'Hémoglobine', val: () => bloodNames[s.blood], left: () => { s.blood = Math.max(0, s.blood - 1); app.saveSettings(); }, right: () => { s.blood = Math.min(3, s.blood + 1); app.saveSettings(); } },
      { label: 'Commentateur', val: () => (s.commentator === false ? 'Muet' : 'Zinzin'), left: () => { s.commentator = s.commentator === false; app.saveSettings(); }, right: () => { s.commentator = s.commentator === false; app.saveSettings(); } },
      { label: 'Filtre pixel', val: () => pix[pixIdx()][1], left: () => setPix(pixIdx() - 1), right: () => setPix(pixIdx() + 1) },
      { label: 'Saut avec le stick', ...toggle(() => s.tapJump !== false, (v) => { s.tapJump = v; }) },
      { label: 'Vibrations', ...toggle(() => !!s.rumble, (v) => { s.rumble = v; }) },
      { label: 'Compteur d\'images (FPS)', ...toggle(() => !!s.showFps, (v) => { s.showFps = v; }) },
      { label: 'Pseudo en ligne', val: () => s.name || '(manette)', act: () => { const n = prompt('Ton pseudo', s.name || ''); if (n !== null) { s.name = n.slice(0, 14); app.saveSettings(); } } },
      { label: 'Retour', act: back },
    ], { left: 150, top: 50, width: 340 });
    this.set((dt) => { this.attractUpdate(dt); const ev = anyMenu(); menu.update(ev); if (ev.back) back(); });
    this.layer.appendChild(el);
  }

  // ---- les mini-jeux un par un (pour les tester) ------------------------------------------------------------------
  // un jeu choisi dans la liste se lance dans un vrai match figé (sans les mini-jeux qui tombent tout seuls) : toi (la manette ou le
  // clavier qui a validé) contre un CPU, ou CPU contre CPU ; Start (Échap) revient à la liste, la fin aussi
  minigameLab() {
    const app = this.app;
    this.startAttract(0.6, 'options');
    const el = h('div', 'px');
    el.innerHTML = '<div class="ptitle txt">MINI-JEUX</div>';
    const L = this.lab || (this.lab = { cpu: false, chars: 0, i: 0, fv: -1, lvl: 1 });
    const LVL = ['', 'Facile', 'Normal', 'Brutal'], lvlStep = (d) => { L.lvl = (((L.lvl || 1) - 1 + d + 3) % 3) + 1; };
    const charModes = ['Au hasard', 'Toujours les mêmes'];
    // les variantes du duel au pistolet (src/sim/mg/duel.js DUEL_VARIANTS, dans l'ordre), -1 : au hasard
    const FV = ['Pétoires', 'Fusil à pompe', 'Akimbo', 'Railgun', 'Roquettes', 'Lune', 'Noir total', 'AWP', 'Sniper des champs'], fvStep = (d) => { L.fv = ((L.fv ?? -1) + 1 + d + FV.length + 1) % (FV.length + 1) - 1; };
    const back = () => { app.audio.sfx('menuBack'); this.go(() => this.mainMenu()); };
    const items = [
      { label: 'Qui joue', val: () => (L.cpu ? 'CPU contre CPU' : 'Toi contre un CPU'), left: () => { L.cpu = !L.cpu; }, right: () => { L.cpu = !L.cpu; } },
      { label: 'Bagarreurs', val: () => charModes[L.chars], left: () => { L.chars = 1 - L.chars; }, right: () => { L.chars = 1 - L.chars; } },
      { label: 'Niveau du CPU', val: () => LVL[L.lvl || 1], left: () => lvlStep(-1), right: () => lvlStep(1) }, // (facile par défaut : pour découvrir les jeux)
      { label: 'Variante du duel', val: () => ((L.fv ?? -1) < 0 ? 'Au hasard' : FV[L.fv]), left: () => fvStep(-1), right: () => fvStep(1) },
      ...Object.keys(ULTI_NAMES).map((k, n) => ({ label: `${n + 1}. ${ULTI_NAMES[k]}`, act: () => { L.i = this.labMenu.i; this.go(() => this.labMatch(k === 'fps' && (L.fv ?? -1) >= 0 ? `fps:${L.fv}` : k)); } })),
      { label: 'Retour', act: back },
    ];
    const menu = new PixelList(el, items, { left: 150, top: 50, width: 340, maxRows: 15 });
    this.labMenu = menu;
    if (L.i) menu.focus(L.i, true);
    this.set((dt) => {
      this.attractUpdate(dt);
      const ev = anyMenu();
      if (ev.confirm && ev.dev) L.dev = ev.dev; // qui a validé joue
      menu.update(ev);
      if (ev.back) back();
    });
    this.layer.appendChild(el);
  }

  labMatch(kind) {
    const app = this.app, L = this.lab;
    this.stopAttract();
    const pick = () => CHAR_ORDER[Math.floor(Math.random() * CHAR_ORDER.length)];
    let c0 = L.chars ? 'pandrezz' : pick(), c1 = L.chars ? 'nymano' : pick();
    while (c1 === c0) c1 = pick();
    const dev = L.cpu ? null : (L.dev || 'kb1');
    const roster = [
      { slot: 0, char: c0, bot: L.cpu ? (L.lvl || 1) : 0, device: dev, name: L.cpu ? 'CPU' : 'Toi' },
      { slot: 1, char: c1, bot: L.lvl || 1, name: 'CPU' },
    ];
    const m = new LocalMatch(app, { stage: 'cemetery', roster, rules: { stocks: 99, hazards: false, minigames: true, mgEvery: 0 }, seed: (Math.random() * 1e9) | 0 });
    m.W.phase = 'play'; // pas de « 3, 2, 1 » : droit au mini-jeu
    this.match = m;
    window.__match = m;
    this.layer.innerHTML = '';
    let started = false, after = 0, leaving = false;
    const leave = () => { if (leaving) return; leaving = true; this.go(() => { this.stopMatch(); this.minigameLab(); }); };
    this.set((dt) => {
      m.update(dt);
      const W = m.W;
      if (!started && W.phase === 'play') { started = true; startMinigame(W, 0, 1, kind); }
      if (started && !W.mg && (after += dt) > 3.4) leave(); // le flash info a eu le temps de passer
      if (anyMenu().start) leave();
    }, () => {});
  }

  howto() {
    const el = h('div', 'panel-screen howto');
    el.innerHTML = `<h1 class="screen-title">Comment jouer</h1>
      <div class="cols">
        <div class="col"><h2>Le but</h2><p>Éjecte tes adversaires de la plateforme ! Plus ton <b>%</b> monte, plus tu voles loin. Sors du cadre (en bas, sur les côtés ou très haut) et tu perds une vie.</p>
          <h2>Manette</h2>
          <table>
            <tr><td>Stick</td><td>Marcher · <b>deux fois vite d'un côté = COURIR</b> (on peut changer de sens en courant) · bas = s'accroupir · <b>deux fois bas</b> sur une plateforme fine (ou bas maintenu en l'air) = passer à travers · haut d'un coup sec = sauter</td></tr>
            <tr><td><b class="btnA">A</b> en courant</td><td>Le <b>coup de course</b> de chaque bagarreur (glissade, plaquage, coup de pied sauté...)</td></tr>
            <tr><td><b class="btnA">A</b></td><td><b>A A A</b> = gauche, droite, coup final · <b>côté + A A A</b> = pied, fesse, tête · tapé = coups rapides qui s'enchaînent · <b>maintenu</b> = <b>SMASH</b> chargé</td></tr>
            <tr><td><b class="btnA">A</b> en l'air</td><td>Neutre · + avant = aérien avant · + arrière = aérien arrière · + haut = aérien haut · + bas = <b>météore</b></td></tr>
            <tr><td><b class="btnX">X</b></td><td>Spécial neutre · <b>X + côté</b> = spécial côté · chacun se recharge : les <b>trois arcs au sol sous ton bagarreur</b> (or = neutre, bleu = côté, rose = bas) se remplissent et s'allument quand c'est prêt. Plus un spécial est fort, plus il est long à revenir.</td></tr>
            <tr><td><b class="btnX">X</b> + haut</td><td>La remontée de chaque perso, pour revenir de loin (X + saut marche aussi) · elle attrape le bord même en montant</td></tr>
            <tr><td><b class="btnX">X</b> + bas</td><td>Spécial bas</td></tr>
            <tr><td><b class="btnB">B</b> / <b class="btnY">Y</b></td><td>Sauter (double saut en l'air) · stick bas en retombant = chute rapide</td></tr>
            <tr><td>Gâchettes</td><td>Bouclier · bouclier + côté = <b>roulade invincible</b> (une vraie roulade, assez longue pour passer derrière) · bouclier + bas = esquive sur place · en l'air = esquive dans la direction du stick · juste avant un coup = <b>PARADE</b></td></tr>
            <tr><td>Bouclier + <b class="btnA">A</b> ou <b>LB/RB</b></td><td>Saisir, puis stick = lancer (avant, arrière, haut, bas), A = frapper</td></tr>
            <tr><td>⚡ <b>Ultime</b></td><td>Donner et surtout <b>encaisser</b> des coups remplit la <b>jauge d'ultime</b> sous ton portrait (elle se vide au KO). Quand elle est pleine, « ULTIME PRÊT ! » : appuie sur <b class="btnA">A</b> + <b class="btnX">X</b> <b>en même temps</b> (clavier : clic gauche + clic droit). <b>Il faut viser</b> : le rayon part tout droit devant toi, à hauteur de poitrine, jusqu'à 11 m. Ceux qui sont dans la bande sont attrapés et subissent toute la cinématique, les autres ne risquent rien ; si personne n'y est, tu as gâché ta jauge. <b>Si tu es dans la zone, tu peux parer</b> : pendant l'entrée en scène un <b>anneau</b> se resserre autour de toi, et quand il devient <b>doré</b> (les 9 dernières images), lève ton <b>bouclier</b> d'<b>un seul appui net</b> (marteler la touche ne marche pas). Le verdict tombe avant le tir : <b>PARADE !</b> et l'ultime est <b>renvoyé</b> sur celui qui l'a lancé, ou <b>RATÉ…</b> et tu le prends.</td></tr>
            <tr><td>Start</td><td>Pause</td></tr>
            <tr><td>🎲 <b>Mini-jeux</b></td><td>Toutes les <b>60 à 80 secondes</b>, au hasard (un compte à rebours ne s'affiche que 5 secondes avant), le combat se fige : deux combattants tirés au hasard s'affrontent 10 secondes dans un <b>mini-jeu au hasard</b> (duel au pistolet, concours de baffes, tiercé de la pinte, danse kawaii, bullet hell... il y en a 14), après une présentation de 3 secondes (le but en une phrase, tes touches). Tous se jouent au clavier seul. Le gagnant fait payer le perdant (un gros paquet de %), puis le combat reprend après 2 secondes figées : le perdant prend un coup qui l'éjecte. Pour les essayer un par un : <b>MINI-JEUX</b> au menu principal.</td></tr>
          </table>
          <h2>Clavier + souris</h2><p><b>ZQSD</b> bouger (on court tout de suite) · <b>Ctrl</b> marcher · <b>clic gauche</b> coup · <b>clic droit</b> spécial · <b>Espace</b> saut · <b>Shift</b> bouclier / esquive · <b>E</b> saisir (aussi J, K, L, U) · au duel au pistolet, ZQSD déplace et le viseur suit l'autre (<b>Z</b> : à la tête), ou <b>la souris vise</b><br>2ᵉ joueur : <b>flèches</b> + pavé num. <b>1</b> coup <b>2</b> spécial <b>0</b> saut <b>3</b> bouclier</p></div>
        <div class="col"><h2>Les bagarreurs</h2>${CHAR_ORDER.map((id) => { const d = CHARS[id]; const sp = d.specialsInfo; return `<div class="hc"><b style="color:${d.color}">${d.name}</b> — <i>${d.title}</i><br><small>X : ${sp.n} · X+côté : ${sp.s} · X+haut : ${sp.u} · X+bas : ${sp.d}</small></div>`; }).join('')}
          <p class="tip">Tung Tung Tung Sahur frappe 25 % plus fort sur le temps de la musique d'origine. Le Parmesan rapetisse en se râpant (plus rapide, mais plus léger). Le 49.3 de Micron traverse les boucliers.</p></div>
      </div><div class="hint"><b class="btnB">B</b> retour</div>`;
    const back = () => { if (!this.slab.busy) this.mainMenu(); };
    el.querySelector('.hint').innerHTML = '<b class="btnB">B</b> / Échap / clic : retour';
    el.onclick = back; // the mouse: a click anywhere goes back
    this.set((dt) => { this.attractUpdate(dt); const ev = anyMenu(); if (ev.back || ev.confirm) back(); });
    this.layer.appendChild(el);
  }
}

// the tournament screens (src/ui/tournament.js) use the same pieces
installTournament(Screens, { h, anyMenu, PixelMenu, PixelList, padLabel, UI, locked: () => inputLock });
