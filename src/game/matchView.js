// Everything drawn during a match: stage, fighters, entities, particles, stains, effects, HUD.
// It only reads a World (the host's real one, or the client's snapshot copy).
import * as THREE from 'three';
import { buildStageView, syncStageView } from '../render/stages/index.js';
import { FighterView } from '../render/fighterView.js';
import { WindCone } from '../render/windCone.js';
import { EntityViews } from '../render/entityView.js';
import { Particles } from '../render/particles.js';
import { DecalSet } from '../render/decals.js';
import { Gore, FRESH, DARK, KETCHUP } from '../render/gore.js';
import { FX } from '../render/fx.js';
import { CameraRig } from '../render/camera.js';
import { Popups } from '../ui/popups.js';
import { HUD } from '../ui/hud.js';
import { STAGES } from '../sim/stages/index.js';
import { MinigameView } from '../render/minigameView.js';
import { UltView } from '../render/ultimate.js';
import { SsbuFx } from '../render/ssbuFx.js';
import { SpeedVideo } from '../render/speedVideo.js';
import { VidFx } from '../render/vidFx.js';
import { ULT_MAX, ultDef } from '../sim/ultimate.js';
import { kameLight } from '../render/pandrezzView.js';

export class MatchView {
  constructor(app, W, opts = {}) {
    this.app = app;
    this.W = W;
    const R = app.renderer;
    this.root = new THREE.Group();
    R.scene.add(this.root);
    const def = STAGES[W.stageId];
    this.stageView = buildStageView(def);
    this.root.add(this.stageView.group);
    const fog = this.stageView.fog;
    // the side camera stands further back than the old top-down one: the fog starts behind the fighters
    R.scene.fog = new THREE.Fog(fog[0], fog[1] + 14, fog[2] + 30);
    this.fogBase = [fog[1], fog[2]];
    R.scene.background = new THREE.Color(this.stageView.bg || fog[0]);
    this.rig = new CameraRig(R.camera);
    this.rig.yaw = W.camYaw || 0;
    this.particles = new Particles(this.root);
    this.particles.camera = app.renderer.camera;
    this.ssbu = new SsbuFx(this.particles); // the Smash Ultimate style impacts (render/ssbuFx.js)
    this.particles.stage = W.stage;
    // stains on every platform (and down the side of the main one), puddles, jets, footprints, liquid (gore.js)
    this.decals = new DecalSet(W.stage);
    this.root.add(this.decals.mesh);
    const blood = app.settings.blood ?? 3;
    this.gore = new Gore(this.decals.mesh, W.stage, this.particles, this.decals, blood);
    const fresh = blood === 1 ? KETCHUP : FRESH;
    // a drop that lands stains the platform it falls on, thrown along its way; a heavy gob sometimes makes a puddle
    this.particles.onGround = (x, y, z, kind, s, surf, vx = 0, vz = 0, gob = false) => {
      if (blood < 2 || !surf) return;
      if (kind === 'blood' && (gob || Math.random() < 0.55)) {
        this.decals.splatOn(surf.idx, x, z, gob ? 0.45 + s * 0.3 : 0.25 + s * 0.25, fresh, gob, [vx, vz]);
        if (gob && s > 1.8 && Math.random() < 0.3) this.gore.puddle(x, y, z, 0.35 + Math.random() * 0.3);
      }
      if (kind === 'chunk') this.decals.splatOn(surf.idx, x, z, 0.5 + s * 0.3, DARK, true, [vx, vz]);
    };
    this.views = {};
    for (const F of W.list) this.views[F.slot] = new FighterView(this.root, F, (opts.names || {})[F.slot]);
    const bloodK = [0, 0.45, 0.85, 1.1][app.settings.blood ?? 3] ?? 1;
    for (const v of Object.values(this.views)) { v.peers = this.views; v.bloodK = bloodK; v.particles = this.particles; } // the grabs reach for the victim (rig/reach.js); blood on the bodies
    this.entities = new EntityViews(this.root);
    this.ultView = new UltView(this); // la scène des ultimes (render/ultimate.js) : son canevas sous les popups et le HUD
    this.popups = new Popups(app.ui, R);
    this.hud = new HUD(app.ui);
    this.hud.setup(W, opts.names || {});
    this.fx = new FX({
      renderer: R, rig: this.rig, particles: this.particles, decals: this.decals, views: this.views, popups: this.popups,
      audio: app.audio, rumble: opts.rumble, settings: app.settings, gore: this.gore,
    });
    this.fx.stageView = this.stageView;
    this.stageView.fx = this.fx; // (an arena that makes its own sounds and lights: zinzin.js)
    // an arena that shows farther than the others (zinzin.js: the way ahead), the camera's far plane pushed back
    this.far0 = R.camera.far;
    if (this.stageView.far) { R.camera.far = this.stageView.far; R.camera.updateProjectionMatrix(); }
    this.fx.ssbu = this.ssbu;
    this.speedvid = new SpeedVideo(R); this.fx.speedvid = this.speedvid; // les lignes de vitesse en vidéo du KO (render/speedVideo.js)
    this.vid = new VidFx(this.root, R.gl); this.fx.vid = this.vid; // les impacts de la vidéo de VFX, découpés en planches (render/vidFx.js)
    // short effects that run by themselves (the shards of a broken shield)
    this.bursts = [];
    this.fx.root = this.root;
    this.fx.addBurst = (f) => this.bursts.push(f);
    this.fx.lightning = (x, z, y) => { if (this.stageView.flashL) this.stageView.flashL.intensity = 6; this.spawnBolt(x, z, y); };
    this.bolts = [];
    this.t = 0;
    this.ultHud = false; // the HUD goes away while an ultimate plays (render)
    this.points = [];
    this.smears = {};
    this.mgView = new MinigameView(this, { deviceOf: opts.deviceOf, names: opts.names });
  }

  spawnBolt(x, z, y0 = 30) {
    const pts = [];
    let px = x, pz = z;
    for (let i = 0; i <= 14; i++) { pts.push(new THREE.Vector3(px, y0 - (i / 14) * (y0 + 0.5), pz)); px += (Math.random() - 0.5) * 1.6; pz += (Math.random() - 0.5) * 1.6; }
    pts[pts.length - 1].set(x, 0, z);
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, 0.22, 4, false);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#f4f8ff', transparent: true, fog: false }));
    this.root.add(m);
    this.bolts.push({ m, t: 0.35 });
  }

  // called after every simulation tick (online with rollback: after the frames of a screen refresh, with their events)
  onTick(W, events = W.events) {
    for (const ev of events) { if (ev.type.startsWith('mg')) this.mgView.onEvent(ev, W); else if (ev.type.startsWith('ult')) this.ultView.onEvent(ev, W); else this.fx.handle(ev, W); }
    this.gore.tick(W, this.views); // bloody footprints, bleeding fighters
    for (const F of W.list) {
      const V = this.views[F.slot];
      if (!V) continue;
      // pendant le duel au pistolet, la cible est un faux combattant nourri par le mini-jeu, les autres sont cachés
      const PF = this.mgView.proxy(F, W);
      if (PF) { if (PF !== 'hide') V.capture(PF); continue; }
      if (F.state === 'respawn' && F.st <= 1) V.snapTo(F); else V.capture(F);
      // blood smear when sliding along the ground while damaged
      if (F.grounded && (F.state === 'hitstun' || F.state === 'down') && F.damage > 30) {
        const s = this.smears[F.slot];
        if (s && Math.hypot(F.x - s.x, F.z - s.z) > 0.3) this.decals.smear(s.x, s.z, F.x, F.z, 0.8 + F.damage / 200, undefined, F.y);
        this.smears[F.slot] = { x: F.x, z: F.z };
      } else this.smears[F.slot] = null;
    }
  }

  render(dt, alpha) {
    const W = this.W, R = this.app.renderer;
    this.t += dt;
    syncStageView(this.stageView, W.stage);
    this.decals.sync(W.stage);
    this.decals.update(dt);
    this.gore.update(dt);
    if (this.stageView.update) this.stageView.update(dt, this.t, W.stage, W);
    this.points.length = 0;
    let danger = 0;
    for (const F of W.list) {
      const V = this.views[F.slot];
      if (!V) continue;
      const PF = this.mgView.proxy(F, W);
      if (PF === 'hide') { this.mgView.hideView(V); continue; }
      V.update(PF || F, W, dt, this.t, alpha);
      if (PF) { V.marker.visible = false; V.cdRing.visible = false; continue; }
      // the shield going up: its own sound (a blow landing on it is 'shieldHit')
      const shUp = F.state === 'shield';
      if (shUp && !V.wasShield && this.fx.audio) this.fx.audio.sfx('shield', this.fx.pan(F.x));
      V.wasShield = shUp;
      // launched: a trail of the run's cartoon smoke (src/render/smoke.js) along the flight, left where the fighter has
      // been, thrown back a little and shrinking away; thicker and bigger the harder the blow, behind the fighters
      const lk = F.launchKb || 0;
      V.smokeT = (V.smokeT || 0) + dt;
      if (F.state === 'hitstun' && F.hitlag <= 0 && lk > 55 && !F.grounded && Math.hypot(F.kx || 0, F.ky || 0) > 4 && V.smokeT > (lk > 130 ? 0.025 : 0.045) && !W.mg && V.root.visible) {
        V.smokeT = 0;
        const p = V.root.position, vx = F.vx || 0, vy = F.vy || 0, m = Math.hypot(vx, vy) || 1, big = Math.min(1, lk / 220);
        const r = 0.26 + big * 0.3, bx = -vx / m, by = -vy / m;
        const jx = (Math.random() - 0.5) * 0.3, jy = (Math.random() - 0.5) * 0.3;
        // fy far below: these puffs float in the air, no floor to squash against
        this.particles.smoke.cloud(p.x + jx, p.y + 0.9 + jy, p.z, -99, bx * (1.2 + big * 1.6) + jx * 3, by * (1.2 + big * 1.6) + jy * 3, (Math.random() - 0.5) * 0.8, r, 0.5 + big * 0.35);
      }
      // the fall: a glint and a whoosh as the fast fall kicks in (Ultimate), then a cone of wind from the feet of a
      // fighter dropping fast, opening behind it along its flight (src/render/windCone.js)
      const ffNow = !!F.ff && !F.grounded;
      if (ffNow && !V.wasFF && F.hitlag <= 0) {
        const p = V.root.position, hh = (V.L && V.L.height) || 1.8;
        this.particles.hit.spawn('stars', p.x, p.y + hh * 1.05, p.z, 0.42, Math.random() * 6, 0.16, '#ffffff', { vy: 1.5 });
        if (this.fx.audio) this.fx.audio.sfx('whoosh', this.fx.pan(F.x), 0.3);
      }
      V.wasFF = ffNow;
      if (!V.wind) V.wind = new WindCone(this.root);
      const vx = F.vx || 0, vy = F.vy || 0, sp = Math.hypot(vx, vy);
      const windOn = sp > 1 && !F.grounded && !W.mg && F.state !== 'hitstun' && V.root.visible && (F.ff || (vy < -11 && sp > 12) || (F.state === 'helpless' && vy < -6));
      V.wind.update(windOn, V.root.position, vx, vy, (V.L && V.L.height) || 1.8, (V.L && V.L.width) || 0.8, this.t, dt);
      // on the run: a puff from the heels now and then, left behind; sliding to a stop: puffs pushed on ahead by the
      // slide (src/render/smoke.js)
      V.stepT = (V.stepT || 0) + dt;
      if (F.grounded && F.state === 'run' && !W.mg && V.root.visible) {
        const ax = Math.abs(vx), dir = Math.sign(vx);
        if (F.skidT > 0 && ax > 3 && V.stepT > 0.05) { V.stepT = 0; this.particles.smoke.kick(F.x + dir * 0.3, F.y, F.z, dir, 1, 1.6, 0.17, vx); }
        else if (!(F.skidT > 0) && ax > 6 && V.stepT > 0.17) { V.stepT = 0; this.particles.smoke.kick(F.x - dir * 0.25, F.y, F.z, -dir, 1, 1.8, 0.14, vx * 0.5); }
      }
      if (!F.out && F.state !== 'dead') {
        this.points.push(V.root.position);
        // close to a blast zone: red edges
        const d = Math.abs(F.x - W.stage.main().cx);
        if (F.state === 'hitstun' && (d > 26 || F.y < -11 || F.y > 21)) danger = Math.max(danger, 0.6);
      }
    }
    this.ultView.afterViews(W);
    // a full gauge: a few multicolour sparks rise around the fighter (the aura itself is in fighterView)
    for (const F of W.list) {
      if (F.ult >= ULT_MAX && ultDef(F) && !F.out && F.state !== 'dead' && !W.ult && Math.random() < dt * 14) {
        const hh = F.height || 1.8;
        this.particles.sparks(F.x + (Math.random() - 0.5) * 0.9, F.y + Math.random() * hh, 0.2, 1, `hsl(${Math.floor(Math.random() * 360)},100%,66%)`, 2.2, 0.55);
      }
    }
    this.entities.update(W.entities, dt, W.stage);
    // pendant un mini-jeu ou un ultime, les projectiles et effets figés du combat (un kamehameha en plein vol...) ne cachent rien
    const hideEnt = !!W.mg || !!W.ult;
    if (hideEnt || this.entHidden) { for (const o of this.entities.map.values()) o.visible = !hideEnt; this.entHidden = hideEnt; }
    this.ssbu.update(dt);
    this.vid.update(dt);
    this.speedvid.update(dt);
    this.particles.update(dt);
    if (this.bursts.length) this.bursts = this.bursts.filter((f) => f(dt));
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]; b.t -= dt; b.m.material.opacity = Math.max(0, b.t / 0.35) * (Math.random() < 0.3 ? 0.3 : 1);
      if (b.t <= 0) { this.root.remove(b.m); b.m.geometry.dispose(); this.bolts.splice(i, 1); }
    }
    const menu = W.phase === 'intro' && W.phaseT < 30;
    if (this.ultHud !== !!W.ult) { this.ultHud = !!W.ult; this.hud.show(!W.ult && !this.hudOff); } // no HUD over the cutscene
    this.ultView.pre(W, dt, alpha);
    this.rig.update(dt, this.points, W.stage.main().r, { menu });
    this.ultView.post(W, dt);
    // the fog follows the camera distance: the fighters stay clear, the far scenery melts away (not during an ultimate:
    // R.fogAway, src/render/ultimate.js pushes it away)
    if (R.scene.fog && this.fogBase && !R.fogAway) { R.scene.fog.near = this.fogBase[0] + this.rig.dist * 0.75; R.scene.fog.far = this.fogBase[1] + this.rig.dist * 0.9; }
    // test view (?closeup=<slot>[&orbit=1]): camera close on one fighter, to judge models and animations
    const cu = this.app.params && this.app.params.get('closeup');
    if (cu !== null && cu !== undefined && this.views[+cu]) {
      const p = this.views[+cu].root.position, a = this.app.params.get('orbit') ? this.t * 0.4 : 0.5;
      const d = +(this.app.params.get('cd') || 4.2);
      R.camera.position.set(p.x + Math.sin(a) * d, p.y + d * 0.32, p.z + Math.cos(a) * d);
      R.camera.lookAt(p.x, p.y + 0.85, p.z);
    }
    R.fx.red += (danger - R.fx.red) * Math.min(1, dt * 6);
    R.fx.gray = W.phase === 'end' ? Math.min(0.4, R.fx.gray + dt * 1.2) : Math.max(0, R.fx.gray - dt * 2);
    this.mgView.update(W, dt, alpha);
    this.popups.update(dt);
    this.hud.update(W, dt);
    if (!this.warm) { this.warm = true; this.prewarm(); }
  }

  // the loading screen (VS): one frame of preparation; true once everything is ready (the first images drawn, the
  // shaders compiled by prewarm, the mini-games' puppets, ghosts and fonts made)
  warmTick() {
    this.warmFrames = (this.warmFrames || 0) + 1;
    const mg = this.mgView.warmBurst(this.W, 14);
    return !!this.warm && mg && this.warmFrames > 20;
  }

  // compiles every shader and uploads every texture the match can show before its first image: the fighters' props
  // hidden until a move, projectiles, buddies, puddles... Otherwise the first time a special shows something new, the
  // game freezes while the GPU compiles it (half a second for Pandrezz's kamehameha). Done after the first update, once
  // the fighters' lazily made pieces exist. The programs stay cached for the next matches.
  prewarm() {
    const R = this.app.renderer, gl = R.gl, t0 = performance.now();
    if (!R.rt) R.resize();
    const extra = this.entities.warmGroup();
    this.ultView.warm(true); this.speedvid.warm(true); this.vid.warm(true);
    for (const v of Object.values(this.views)) v.aura.visible = true;
    kameLight(R.scene); // (the kamehameha's light, there from the start: no recompiling when a Pandrezz first appears)
    extra.add(this.gore.warm()); // the puddles, the jets, the liquid
    const prev = gl.getRenderTarget();
    try {
      gl.setRenderTarget(R.rt || null);
      gl.compile(R.scene, R.camera);
      gl.compile(extra, R.camera, R.scene);
    } catch (err) { console.warn('prewarm', err); }
    // le fond des ultimes (une image) : son shader, rendu une fois (compile() ne fait pas le fond)
    const bg0 = R.scene.background;
    try { R.scene.background = this.ultView.bgTex; gl.setRenderTarget(R.rt || null); gl.render(R.scene, R.camera); } catch (err) { /* tant pis */ }
    R.scene.background = bg0;
    gl.setRenderTarget(prev);
    this.ultView.warm(false); this.speedvid.warm(false); this.vid.warm(false);
    for (const v of Object.values(this.views)) v.aura.visible = false;
    const seen = new Set();
    const tex = (v) => { if (v && v.isTexture && !seen.has(v)) { seen.add(v); try { gl.initTexture(v); } catch (err) { /* not loaded yet */ } } };
    const up = (o) => {
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) {
        for (const k in m) tex(m[k]);
        if (m.uniforms) for (const k in m.uniforms) tex(m.uniforms[k].value);
      }
    };
    R.scene.traverse(up);
    extra.traverse(up);
    this.warmMs = performance.now() - t0;
  }

  dispose() {
    const R = this.app.renderer;
    R.scene.remove(this.root);
    R.scene.fog = null;
    if (this.far0 && R.camera.far !== this.far0) { R.camera.far = this.far0; R.camera.updateProjectionMatrix(); }
    this.popups.clear();
    this.popups.layer.remove();
    this.hud.el.remove();
    this.hud.timer.remove();
    this.mgView.dispose();
    this.ultView.dispose(); this.speedvid.dispose(); this.vid.dispose();
    this.gore.dispose();
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    R.fx.red = 0; R.fx.gray = 0;
  }
}
