// Peer-to-peer networking. The host's browser is the server: it runs the match and sends snapshots.
// Transport "peer" = WebRTC through PeerJS (free public signalling server, no server of our own);
// transport "local" = BroadcastChannel between tabs of the same browser (tests, no internet needed).
export const PROTOCOL = 10; // 10: Ronare's own moveset ; 9: cooldowns, notes without flinch, PPROD's loot ; 8: new fighter (ronare) ; 7: new arena (zinzin) ; 6: la version de redpandrezz fusionnée (boucliers, esquives, priorité des coups) ; 5: new arena (mirror) ; 4: rollback (every machine runs the match)
const PREFIX = 'spookybagarre-v' + PROTOCOL + '-';
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';

export function randomCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  return s;
}

const ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

function extraIce() {
  try { const t = JSON.parse(localStorage.getItem('spookybagarre.turn') || 'null'); return t ? [t] : []; } catch (e) { return []; }
}

class Emitter {
  constructor() { this.h = {}; }
  on(t, f) { (this.h[t] = this.h[t] || []).push(f); return () => { this.h[t] = this.h[t].filter((x) => x !== f); }; }
  emit(t, ...a) { for (const f of this.h[t] || []) f(...a); }
}

// --- PeerJS transport --------------------------------------------------------------------------------------------
export class PeerNet extends Emitter {
  constructor() { super(); this.peers = new Map(); this.id = null; this.isHost = false; }

  host(code) {
    return new Promise((res, rej) => {
      if (!window.Peer) return rej(new Error('PeerJS non chargé (connexion internet ?)'));
      this.isHost = true;
      this.code = code;
      this.peer = new window.Peer(PREFIX + code, { config: { iceServers: [...ICE, ...extraIce()] }, debug: 1 });
      const to = setTimeout(() => rej(new Error('Le serveur de mise en relation ne répond pas')), 12000);
      this.peer.on('open', (id) => { clearTimeout(to); this.id = id; res(code); });
      this.peer.on('error', (e) => { clearTimeout(to); if (e.type === 'unavailable-id') rej(new Error('Code déjà pris')); else { rej(e); this.emit('error', e); } });
      this.peer.on('connection', (conn) => this.accept(conn));
      this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch (e) { /* */ } });
    });
  }

  accept(conn) {
    const pid = conn.peer;
    let p = this.peers.get(pid);
    if (!p) { p = { id: pid }; this.peers.set(pid, p); }
    conn.on('open', () => {
      p[conn.label === 'u' ? 'u' : 'r'] = conn;
      if (p.r && !p.announced) { p.announced = true; this.emit('peer', pid); }
    });
    conn.on('data', (m) => this.emit('msg', m, pid));
    conn.on('close', () => { if (this.peers.has(pid)) { this.peers.delete(pid); this.emit('leave', pid); } });
    conn.on('error', () => {});
  }

  join(code) {
    return new Promise((res, rej) => {
      if (!window.Peer) return rej(new Error('PeerJS non chargé (connexion internet ?)'));
      this.code = code;
      this.peer = new window.Peer(undefined, { config: { iceServers: [...ICE, ...extraIce()] }, debug: 1 });
      const to = setTimeout(() => rej(new Error('Impossible de joindre le salon ' + code)), 15000);
      this.peer.on('error', (e) => { clearTimeout(to); rej(e.type === 'peer-unavailable' ? new Error('Salon ' + code + ' introuvable') : e); this.emit('error', e); });
      this.peer.on('open', (id) => {
        this.id = id;
        const hostId = PREFIX + code;
        const r = this.peer.connect(hostId, { label: 'r', reliable: true, serialization: 'json' });
        const u = this.peer.connect(hostId, { label: 'u', reliable: false, serialization: 'json' });
        const host = { id: hostId };
        this.peers.set(hostId, host);
        let opened = 0;
        const ok = () => { if (++opened === 2) { clearTimeout(to); res(id); } };
        for (const c of [r, u]) {
          c.on('open', () => { host[c.label] = c; ok(); });
          c.on('data', (m) => this.emit('msg', m, hostId));
          c.on('close', () => { if (this.peers.has(hostId)) { this.peers.delete(hostId); this.emit('leave', hostId); } });
          c.on('error', () => {});
        }
      });
    });
  }

  send(pid, msg, fast = false) {
    const p = this.peers.get(pid);
    if (!p) return;
    const c = (fast && p.u && p.u.open) ? p.u : p.r;
    if (c && c.open) { try { c.send(msg); } catch (e) { /* closed */ } }
  }

  broadcast(msg, fast = false) { for (const pid of this.peers.keys()) this.send(pid, msg, fast); }

  close() { try { this.peer && this.peer.destroy(); } catch (e) { /* */ } this.peers.clear(); }
}

// --- BroadcastChannel transport (same browser, several tabs) --------------------------------------------------------
export class LocalNet extends Emitter {
  constructor() { super(); this.peers = new Map(); this.id = 'tab-' + Math.random().toString(36).slice(2, 8); this.isHost = false; this.lastRel = {};
    // bad network on purpose (tests): ?netlag=<ms one way>&jitter=<ms>&loss=<0..1, fast messages only>
    const p = new URLSearchParams(location.search);
    this.lag = +(p.get('netlag') || 0); this.jitter = +(p.get('jitter') || 0); this.loss = +(p.get('loss') || 0);
  }

  open(code) {
    this.code = code;
    this.ch = new BroadcastChannel(PREFIX + code);
    this.ch.onmessage = (e) => {
      const { from, to, msg, kind, fast } = e.data;
      if (from === this.id || (to && to !== this.id)) return;
      const deliver = () => {
        if (kind === 'hello') {
          if (this.isHost && !this.peers.has(from)) { this.peers.set(from, { id: from }); this.ch.postMessage({ from: this.id, to: from, kind: 'welcome' }); this.emit('peer', from); }
          return;
        }
        if (kind === 'welcome') { this.peers.set(from, { id: from }); if (this.onWelcome) this.onWelcome(from); return; }
        if (kind === 'bye') { if (this.peers.delete(from)) this.emit('leave', from); return; }
        this.emit('msg', msg, from);
      };
      if (!this.lag && !this.jitter && !this.loss) { deliver(); return; }
      if (fast && Math.random() < this.loss) return;
      const now = performance.now();
      let at = now + this.lag + Math.random() * this.jitter;
      if (!fast) { at = Math.max(at, this.lastRel[from] || 0); this.lastRel[from] = at; } // the reliable channel keeps its order
      this.later(at, deliver);
    };
    window.addEventListener('beforeunload', () => this.ch.postMessage({ from: this.id, kind: 'bye' }));
  }

  // delayed delivery on a worker clock: a tab in the background slows its own timers down to one per second
  later(at, f) {
    (this.queue = this.queue || []).push({ at, f });
    if (this.clock) return;
    const flush = () => {
      const now = performance.now();
      const due = this.queue.filter((q) => q.at <= now).sort((a, b) => a.at - b.at);
      if (!due.length) return;
      this.queue = this.queue.filter((q) => q.at > now);
      for (const q of due) q.f();
    };
    try {
      this.clock = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 4);'], { type: 'text/javascript' })));
      this.clock.onmessage = flush;
    } catch (e) { const id = setInterval(flush, 4); this.clock = { terminate: () => clearInterval(id) }; }
  }

  host(code) { this.isHost = true; this.open(code); return Promise.resolve(code); }

  join(code) {
    this.open(code);
    return new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('Salon local ' + code + ' introuvable')), 4000);
      this.onWelcome = () => { clearTimeout(to); res(this.id); };
      this.ch.postMessage({ from: this.id, kind: 'hello' });
    });
  }

  send(pid, msg, fast = false) { this.ch.postMessage({ from: this.id, to: pid, msg, fast }); }
  broadcast(msg, fast = false) { this.ch.postMessage({ from: this.id, msg, fast }); }
  close() { if (this.ch) { this.ch.postMessage({ from: this.id, kind: 'bye' }); this.ch.close(); } if (this.clock) this.clock.terminate(); }
}

export function makeNet(kind) { return kind === 'local' ? new LocalNet() : new PeerNet(); }
