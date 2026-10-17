// A play session: the lobby (slots, characters, stage, rules) and, online, the messages between host and clients.
// mode 'local' (one machine), 'host' (this browser runs the matches) or 'client'.
import { makeNet, randomCode } from '../net/net.js';
import { CHAR_ORDER } from '../sim/chars/index.js';
import { STAGE_ORDER } from '../sim/stages/index.js';
import { Input } from '../core/input.js';
import * as Tour from './tournament.js';

export const MAX_SLOTS = 4;

export class Session {
  constructor(app, mode, transport = 'peer') {
    this.app = app;
    this.mode = mode;
    this.transport = transport;
    this.net = mode === 'local' ? null : makeNet(transport);
    this.me = mode === 'client' ? null : 'host';
    const s = app.settings;
    this.lobby = {
      slots: [null, null, null, null],
      // chooser: who picks the arena (the player who pressed START, the host's guest too: the others watch)
      stage: 'cemetery', phase: 'charsel', stageCursor: 0, chooser: null,
      rules: { mode: s.mode, stocks: s.stocks, time: s.time, hazards: s.hazards, minigames: s.minigames !== false, ult: s.ult !== false, cpuLevel: s.cpuLevel },
      code: null, v: 0,
      tour: null, // the tournament of this session (src/game/tournament.js), when it is one
    };
    this.listeners = new Set();
    this.remoteInputs = {};
    this.lastSend = 0;
  }

  onChange(f) { this.listeners.add(f); return () => this.listeners.delete(f); }
  changed(broadcast = true) {
    this.lobby.v++;
    for (const f of this.listeners) f(this.lobby);
    if (broadcast && this.mode === 'host') this.net.broadcast({ t: 'lobby', l: this.lobby });
  }

  // ---- connection -------------------------------------------------------------------------------------------
  async hostOnline() {
    let code = randomCode();
    for (let i = 0; i < 4; i++) {
      try { await this.net.host(code); break; } catch (e) { if (/pris/.test(e.message) && i < 3) { code = randomCode(); continue; } throw e; }
    }
    this.lobby.code = code;
    this.me = this.net.id || 'host';
    this.net.on('peer', (pid) => { this.net.send(pid, { t: 'lobby', l: this.lobby }); this.app.audio.sfx('menuOk'); });
    this.net.on('leave', (pid) => {
      this.lobby.slots = this.lobby.slots.map((s) => (s && s.owner === pid ? null : s));
      delete this.remotePeers?.[pid];
      this.changed();
      if (this.onPeerLeft) this.onPeerLeft(pid);
    });
    this.net.on('msg', (m, pid) => this.hostMessage(m, pid));
    this.changed(false);
    return code;
  }

  async joinOnline(code) {
    const id = await this.net.join(code.toUpperCase());
    this.me = id;
    this.lobby.code = code.toUpperCase();
    this.net.on('msg', (m) => this.clientMessage(m));
    this.net.on('leave', () => { if (this.onHostLost) this.onHostLost(); });
    this.net.send([...this.net.peers.keys()][0], { t: 'hello', name: this.app.settings.name });
    return id;
  }

  hostId() { return [...this.net.peers.keys()][0]; }

  // host: forget a guest that stopped answering, as if it had left (its slots free up)
  dropPeer(pid) {
    const p = this.net.peers.get(pid);
    if (p) for (const c of [p.r, p.u]) { try { if (c) c.close(); } catch (e) { /* */ } }
    if (this.net.peers.delete(pid)) this.net.emit('leave', pid);
  }

  // ---- lobby operations (go through the host when online) --------------------------------------------------------
  request(op) {
    if (this.mode === 'client') { this.net.send(this.hostId(), { t: 'op', op }); return; }
    this.apply(op, this.me);
  }

  apply(op, owner) {
    const L = this.lobby;
    const slot = L.slots[op.slot];
    const mine = slot && (slot.owner === owner || (slot.cpu && owner === this.me));
    // the host, or the player who took the arena choice
    const boss = owner === this.me || (L.chooser && owner === L.chooser);
    switch (op.k) {
      case 'join': {
        if (L.slots.some((s) => s && s.owner === owner && s.dev === op.dev)) return;
        const i = L.slots.findIndex((s) => !s);
        if (i < 0) return;
        L.slots[i] = { owner, dev: op.dev, name: op.name || 'J' + (i + 1), char: null, cursor: CHAR_ORDER.indexOf(CHAR_ORDER[i % CHAR_ORDER.length]), ready: false, cpu: 0 };
        break;
      }
      case 'leave': if (mine) L.slots[op.slot] = null; break;
      case 'cursor': if (mine) slot.cursor = op.c; break;
      case 'pick': if (mine) { slot.char = op.char; slot.ready = !!op.char; } break;
      case 'cpu+': {
        if (owner !== this.me) return;
        const i = L.slots.findIndex((s) => !s);
        if (i < 0) return;
        const c = CHAR_ORDER.includes(op.char) ? op.char : CHAR_ORDER[Math.floor(Math.random() * CHAR_ORDER.length)]; // (op.char : le perso choisi par celui qui l'ajoute, sinon au hasard)
        L.slots[i] = { owner, dev: null, name: 'CPU', char: c, cursor: CHAR_ORDER.indexOf(c), ready: true, cpu: L.rules.cpuLevel || 2 };
        break;
      }
      case 'cpu-': {
        if (owner !== this.me) return;
        for (let i = MAX_SLOTS - 1; i >= 0; i--) if (L.slots[i] && L.slots[i].cpu) { L.slots[i] = null; break; }
        break;
      }
      case 'cpuChar': if (slot && slot.cpu && owner === this.me) { slot.char = op.char; slot.cursor = CHAR_ORDER.indexOf(op.char); } break;
      case 'cpuLvl': if (slot && slot.cpu && owner === this.me) slot.cpu = op.lvl; break;
      case 'stage': if (boss && L.phase === 'stagesel') { L.stage = op.stage; L.stageCursor = op.cursor ?? STAGE_ORDER.indexOf(op.stage); } break;
      case 'rules': if (boss && L.phase === 'stagesel') Object.assign(L.rules, op.rules); break;
      case 'phase': if (owner === this.me) { L.phase = op.phase; if (op.phase === 'charsel') L.chooser = null; } break;
      // START once everybody is ready: whoever has a ready fighter (or the host) goes to the arena choice; after a
      // match, the one who chose the arena
      case 'toStage': {
        if (L.tour && L.tour.cur && L.phase === 'charsel') {
          if (!this.allReady()) return;
          const R = L.tour.rules;
          const st = R.stage && R.stage !== 'random' && STAGE_ORDER.includes(R.stage) ? R.stage : STAGE_ORDER[Math.floor(Math.random() * STAGE_ORDER.length)];
          L.stage = st; L.phase = 'tvs';
          this.changed();
          if (this.onCmd) this.onCmd('tvs', st);
          return;
        }
        if (L.phase === 'charsel') {
          if (!this.allReady()) return;
          if (owner !== this.me && !L.slots.some((s) => s && !s.cpu && s.owner === owner)) return;
        } else if (!boss || L.phase === 'stagesel') return;
        L.chooser = owner; L.phase = 'stagesel';
        this.changed();
        if (this.onCmd) this.onCmd('stagesel');
        return;
      }
      case 'toChars': {
        if (!boss || L.phase === 'charsel') return;
        L.chooser = null; L.phase = 'charsel';
        this.changed();
        if (this.onCmd) this.onCmd('charsel');
        return;
      }
      // the arena chosen, or a rematch from the results
      case 'launch': {
        if (!boss || !op.stage || (L.phase !== 'stagesel' && L.phase !== 'results')) return;
        L.stage = op.stage;
        this.changed();
        if (this.onCmd) this.onCmd('launch', op.stage);
        return;
      }
      // --- the tournament (src/game/tournament.js, screens in src/ui/tournament.js): the host decides, every
      // machine adds, renames and removes its own players during the setup
      case 'tNew': if (owner !== this.me) return; L.tour = op.tour || Tour.newTournament(op.rules); L.phase = op.tour ? (op.tour.phase === 'setup' ? 'tsetup' : 'tbracket') : 'tsetup'; break;
      case 'tAdd': if (L.tour && L.tour.phase === 'setup') Tour.addPlayer(L.tour, op.name, owner); break;
      case 'tDel': { const P = L.tour && Tour.player(L.tour, op.id); if (P && (P.owner === owner || owner === this.me)) Tour.removePlayer(L.tour, op.id); break; }
      case 'tName': { const P = L.tour && Tour.player(L.tour, op.id); if (P && (P.owner === owner || owner === this.me)) Tour.renamePlayer(L.tour, op.id, op.name); break; }
      case 'tRules': if (owner === this.me && L.tour && L.tour.phase === 'setup') Object.assign(L.tour.rules, op.rules); break;
      case 'tDraw': {
        if (owner !== this.me || !L.tour || L.tour.phase !== 'setup' || L.tour.players.length < 2) return;
        const ids = L.tour.players.map((x) => x.id);
        for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
        Tour.draw(L.tour, ids);
        L.tour.drawn = (L.tour.drawn || 0) + 1; // the screens play the draw once
        L.phase = 'tbracket';
        this.changed();
        if (this.onCmd) this.onCmd('tbracket');
        return;
      }
      // the next duel: its two players take the two first slots (their pads not yet known), the rules of the tournament
      case 'tNext': {
        if (owner !== this.me || !L.tour) return;
        const M = Tour.nextMatch(L.tour);
        if (!M) return;
        L.tour.cur = M.id;
        const R = L.tour.rules;
        L.rules = { ...L.rules, mode: 'stock', stocks: R.stocks, hazards: R.hazards, minigames: R.minigames };
        L.slots = [M.a, M.b].map((pid) => {
          const P = Tour.player(L.tour, pid);
          const c = P.char && CHAR_ORDER.includes(P.char) ? CHAR_ORDER.indexOf(P.char) : Math.floor(Math.random() * CHAR_ORDER.length);
          return { owner: P.owner, dev: null, name: P.name, pid, char: null, cursor: c, ready: false, cpu: 0 };
        }).concat([null, null]);
        L.chooser = null; L.phase = 'charsel';
        this.changed();
        if (this.onCmd) this.onCmd('charsel');
        return;
      }
      // a pad takes a duelist's place (local: any pad; online: one of the machine that brought that player)
      case 'tClaim': if (slot && slot.pid && slot.owner === owner && !slot.dev && !L.slots.some((x) => x && x.owner === owner && x.dev === op.dev)) slot.dev = op.dev; break;
      case 'tUnclaim': if (mine && slot.pid) { slot.dev = null; slot.ready = false; slot.char = null; } break;
      case 'tBack': {
        if (owner !== this.me || !L.tour) return;
        L.tour.cur = L.tour.phase === 'done' ? L.tour.cur : (L.phase === 'charsel' ? null : L.tour.cur);
        L.phase = 'tbracket';
        this.changed();
        if (this.onCmd) this.onCmd('tbracket');
        return;
      }
      case 'tChamp': if (owner !== this.me || !L.tour || L.tour.phase !== 'done') return; L.phase = 'tchamp'; this.changed(); if (this.onCmd) this.onCmd('tchamp'); return;
      case 'tQuit': if (owner !== this.me) return; L.tour = null; L.phase = 'charsel'; L.slots = [null, null, null, null]; break;
      default: return;
    }
    this.changed();
  }

  // host: a duel of the tournament is over (src/ui/screens.js finishMatch): the bracket goes on
  tourReport(res) {
    const L = this.lobby, T = L.tour;
    const M = T && T.cur && Tour.matchById(T, T.cur);
    if (!M || M.w) return;
    const pidOf = (slot) => L.slots[slot] && L.slots[slot].pid;
    const w = res.r[0], l = res.r[1];
    const wid = pidOf(w.slot), lid = l ? pidOf(l.slot) : (wid === M.a ? M.b : M.a);
    const stats = {}, chars = {};
    for (const x of res.r) { const pid = pidOf(x.slot); if (pid) { stats[pid] = { kos: x.kos, falls: x.falls, dealt: x.dealt }; chars[pid] = x.char; } }
    Tour.win(T, M, wid, lid, { stats, chars, score: { [wid]: w.stocks ?? 0 } });
    T.cur = null;
    L.phase = 'results';
    this.changed();
  }

  // host: a machine left in the middle of a tournament: its players lose their duels by forfeit
  tourPeerLeft(pid) {
    const T = this.lobby.tour;
    if (!T) return false;
    const mine = T.players.filter((P) => P.owner === pid).map((P) => P.id);
    for (const id of mine) Tour.forfeit(T, id);
    return mine.length > 0;
  }

  hostMessage(m, pid) {
    if (!m || !m.t) return;
    if (m.t === 'hello') { this.net.send(pid, { t: 'lobby', l: this.lobby }); return; }
    if (m.t === 'op') { this.apply(m.op, pid); return; }
    if (m.t === 'in') {
      for (const [slot, a] of Object.entries(m.p || {})) {
        const S = this.lobby.slots[slot];
        if (!S || S.owner !== pid) continue;
        this.remoteInputs[slot] = { mx: a[0], my: a[1], held: a[2], cnt: a.slice(3, 9) };
      }
      return;
    }
    if (m.t === 'diag') {
      const S = this.lobby.slots.find((x) => x && x.owner === pid);
      if (this.onDiag) this.onDiag((S && S.name) || 'un invité', String(m.msg || '').slice(0, 300));
      return;
    }
    if (m.t === 'needSnaps') { (this.reliableSnaps = this.reliableSnaps || new Set()).add(pid); return; }
    if (m.t === 'ping') { this.net.send(pid, { t: 'pong', c: m.c, h: performance.now() }, true); return; }
    if (this.onHostMsg) this.onHostMsg(m, pid);
  }

  clientMessage(m) {
    if (!m || !m.t) return;
    if (m.t === 'lobby') { this.lobby = m.l; for (const f of this.listeners) f(this.lobby); return; }
    if (this.onClientMsg) this.onClientMsg(m);
  }

  // ---- helpers ------------------------------------------------------------------------------------------------
  mySlots() {
    return this.lobby.slots.map((s, i) => (s && s.owner === this.me && s.dev ? i : -1)).filter((i) => i >= 0);
  }
  slotOfDevice(dev) {
    return this.lobby.slots.findIndex((s) => s && s.owner === this.me && s.dev === dev);
  }
  // this machine picks the arena (local: always; online: the host until a player takes it, then that player)
  choosing() { return this.mode === 'local' || this.lobby.chooser === this.me || (!this.lobby.chooser && this.mode === 'host'); }
  humans() { return this.lobby.slots.filter((s) => s && !s.cpu); }
  allReady() {
    const used = this.lobby.slots.filter(Boolean);
    return used.length >= 2 && used.every((s) => s.ready && s.char);
  }

  roster() {
    return this.lobby.slots.map((s, i) => (s ? {
      slot: i, char: s.char, bot: s.cpu || 0, name: s.name,
      device: s.owner === this.me && s.dev ? s.dev : null,
      remote: s.owner !== this.me && !s.cpu,
    } : null)).filter(Boolean);
  }

  // client: report an error to the host (it shows on the host's screen)
  sendDiag(msg) { if (this.mode === 'client' && this.net) this.net.send(this.hostId(), { t: 'diag', msg }); }

  // client: the fast channel brings nothing through, ask for the pictures on the reliable one
  askReliableSnaps() { if (this.mode === 'client' && this.net) this.net.send(this.hostId(), { t: 'needSnaps' }); }

  // host: a snapshot to every client, on the fast channel unless that client asked for the reliable one
  sendSnap(msg) {
    for (const pid of this.net.peers.keys()) this.net.send(pid, msg, !(this.reliableSnaps && this.reliableSnaps.has(pid)));
  }

  // client: send local inputs for my slots
  sendInputs() {
    if (this.mode !== 'client') return;
    const p = {};
    for (const i of this.mySlots()) {
      const s = Input.sample(this.lobby.slots[i].dev);
      p[i] = [s.mx, s.my, s.held, ...s.cnt];
    }
    if (Object.keys(p).length) this.net.send(this.hostId(), { t: 'in', p }, true);
  }

  close() { if (this.net) this.net.close(); }
}
