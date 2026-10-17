// Entities on screen: projectiles, rings, clouds, puddles, humans, hazards.
import * as THREE from 'three';
import { mat, basic, G, mesh, glowTex, stripes, speckle, puffTex } from './materials.js';
import { STYLE } from './style.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { fitProp } from './propModels.js';
import { beamObj, updateBeam, buddyObj, updateBuddy, DISC_BUILD } from './pandrezzView.js';
import { energyBall, streamObj } from './fxShaders.js';
import { friendBuild, greyCat, petObj, updatePet } from './friendsView.js';
import { EPEKTASE_BUILD } from './rig/epektaseRig.js';
import { PPROD_BUILD, noodles } from './rig/pprodRig.js';
import { SKANKY_BUILD } from './rig/skankyRig.js';
import { ANBUU_BUILD } from './rig/anbuuRig.js';
import { RONARE_BUILD } from './rig/ronareRig.js';
import { PASS_BUILD, PASS_KINDS } from './passView.js';

// static models for creatures / props: cats of La Folle Du Bus (tools/blender/prop.py), Pandrezz's friends (buddies.py)
const MODELS = {};
export const ENTITY_MODELS = MODELS; // (les marionnettes des mini-jeux : le shiba, src/render/puppets.js)
export function preloadEntityModels(ids = ['cat', 'cdman', 'vinylman', 'shiba', 'greycat']) {
  const L = new GLTFLoader();
  return Promise.all(ids.map((id) => new Promise((res) => L.load(`assets/models/${id}.glb`, (g) => { MODELS[id] = g.scene; res(); }, undefined, () => res()))));
}

// a cat (largest side `s` metres), tinted for the variants; primitive fallback without the model
export function catHeld(s, tint) { return catObj(s, tint); }
export function greyHeld(s) { return greyCat(MODELS, catObj, s); }
function catObj(s, tint) {
  const g = new THREE.Group();
  if (MODELS.cat) {
    const c = MODELS.cat.clone(true);
    c.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); if (tint) o.material.color.set(tint); o.castShadow = true; } });
    c.scale.setScalar(s);
    g.add(c);
  } else {
    const fur = mat(tint || '#f2902a');
    g.add(mesh(G.ball(0.5, 1), fur, [0, 0, 0], null, [0.8, 0.6, 1.1]), mesh(G.ball(0.3, 1), fur, [0, 0.2, 0.45]),
      mesh(G.cone(0.1, 0.22, 4), fur, [0.15, 0.45, 0.45]), mesh(G.cone(0.1, 0.22, 4), fur, [-0.15, 0.45, 0.45]),
      mesh(G.cyl(0.06, 0.04, 0.6, 5), fur, [0, 0.3, -0.6], [-0.6, 0, 0]));
    g.scale.setScalar(s);
  }
  g.userData.cat = true;
  return g;
}

function grp(...c) { const g = new THREE.Group(); c.forEach((x) => x && g.add(x)); return g; }

function person(colors) {
  const { skin = '#f0b088', top = '#3a7bd5', bottom = '#333333', hair = '#3b2a1a' } = colors;
  const g = grp(
    mesh(G.rbox(0.42, 0.5, 0.28, 0.4), mat(top), [0, 0.95, 0]),
    mesh(G.box(0.36, 0.4, 0.26), mat(bottom), [0, 0.5, 0]),
    mesh(G.ball(0.2, 1), mat(skin), [0, 1.42, 0]),
    mesh(G.ball(0.21, 1), mat(hair), [0, 1.5, -0.04], null, [1, 0.6, 1]),
    mesh(G.ball(0.07, 0), mat(skin), [0.3, 0.9, 0.05]),
    mesh(G.ball(0.07, 0), mat(skin), [-0.3, 0.9, 0.05]),
    mesh(G.box(0.12, 0.08, 0.2), mat('#222'), [0.1, 0.06, 0.04]),
    mesh(G.box(0.12, 0.08, 0.2), mat('#222'), [-0.1, 0.06, 0.04]),
    mesh(G.ball(0.035, 0), basic('#111'), [0.07, 1.45, 0.18]),
    mesh(G.ball(0.035, 0), basic('#111'), [-0.07, 1.45, 0.18]),
  );
  return g;
}

const HUMAN = {
  cat: () => catObj(0.62),
  kitten: () => catObj(0.42, '#7a7380'),
  jogger: () => { const g = person({ top: '#ff4fa3', bottom: '#2b2bff', hair: '#e8c040' }); g.add(mesh(G.box(0.44, 0.06, 0.3), mat('#ffffff'), [0, 1.53, 0])); return g; },
  mamie: () => { const g = person({ top: '#7a4a9a', bottom: '#5a3a7a', hair: '#d8d8e0', skin: '#f0c0a0' }); g.add(mesh(G.ball(0.12, 1), mat('#d8d8e0'), [0, 1.66, -0.05])); g.add(mesh(G.box(0.22, 0.2, 0.08), mat('#9a2a2a'), [0.34, 0.78, 0.1])); return g; },
  touriste: () => { const g = person({ top: '#ffa21a', bottom: '#e8d8b0', hair: '#7a5030' }); g.add(mesh(G.box(0.18, 0.12, 0.12), mat('#222'), [0, 1.05, 0.2])); g.add(mesh(G.cyl(0.24, 0.24, 0.06, 8), mat('#f0e0a0'), [0, 1.6, 0])); return g; },
  beauf: () => { const g = person({ top: '#f4f4f4', bottom: '#3a5aa0', hair: '#2a1a0a', skin: '#e89a7a' }); g.add(mesh(G.box(0.16, 0.04, 0.04), mat('#2a1a0a'), [0, 1.37, 0.19])); g.children[0].scale.set(1.3, 1, 1.4); return g; },
  greycat: () => { const c = greyCat(MODELS, catObj, 0.6); c.userData.cat = true; return c; },
  stagiaire: () => { const g = person({ top: '#dfe8f0', bottom: '#2a2a3a', hair: '#1a1a1a' }); g.add(mesh(G.cyl(0.06, 0.05, 0.14, 6), mat('#ffffff'), [0.3, 1.0, 0.12])); return g; },
};

function bolt(h = 7) {
  const pts = [];
  let x = 0, z = 0;
  for (let i = 0; i <= 10; i++) { pts.push(new THREE.Vector3(x, -i * h / 10, z)); x += (Math.random() - 0.5) * 0.8; z += (Math.random() - 0.5) * 0.8; }
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.12, 4, false);
  return mesh(geo, basic('#fff6a0'));
}

const BUILD = {
  bill: () => mesh(new THREE.PlaneGeometry(0.42, 0.21), mat('#ffffff', { map: stripes('billt', '#86cf6e', '#5ea54a', 8, 2), side: THREE.DoubleSide })),
  powderbag: () => grp(mesh(G.ball(0.2, 1), mat('#f6f6f6'), [0, 0, 0], null, [1, 1.2, 1]), mesh(G.cyl(0.05, 0.09, 0.12, 6), mat('#dddddd'), [0, 0.24, 0])),
  burger: () => grp(
    mesh(G.cyl(0.38, 0.45, 0.2, 9), mat('#d99a43'), [0, 0.2, 0]), mesh(G.cyl(0.47, 0.47, 0.12, 9), mat('#4a2410'), [0, 0, 0]),
    mesh(G.cyl(0.5, 0.5, 0.04, 9), mat('#f5c832'), [0, 0.07, 0]), mesh(G.cyl(0.49, 0.49, 0.05, 9), mat('#3fae3a'), [0, -0.08, 0]),
    mesh(G.cyl(0.45, 0.4, 0.14, 9), mat('#d99a43'), [0, -0.18, 0])),
  fry: () => mesh(G.box(0.08, 0.08, 0.55), mat('#ffd34a', { emissive: '#3a2a00' })),
  shard: () => mesh(new THREE.ConeGeometry(0.5, 0.9, 3), mat('#ffffff', { map: speckle('parm', '#f2d77a', ['#e3c160', '#fae9a8', '#d8b04f', '#fff3c4'], 64, 140, 0.5, 2.2) }), [0, 0, 0], [Math.PI / 2, 0, 0], [1, 1, 0.35]),
  humanball: () => grp(mesh(new THREE.SphereGeometry(0.3, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), mat('#e8382c')), mesh(new THREE.SphereGeometry(0.3, 10, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat('#f4f4f4')), mesh(G.cyl(0.32, 0.32, 0.04, 10), mat('#222')), mesh(G.cyl(0.08, 0.08, 0.36, 8), mat('#ffffff'), [0, 0, 0], [Math.PI / 2, 0, 0])),
  capball: () => BUILD.humanball(),
  bat: () => grp(mesh(G.cyl(0.13, 0.06, 1.4, 7), mat('#d8a868'), [0, 0, 0], [Math.PI / 2, 0, 0])),
  merguez: () => mesh(G.cyl(0.08, 0.08, 0.5, 6), mat('#9a3a20'), [0, 0, 0], [Math.PI / 2, 0, 0]),
  coffee: () => grp(mesh(G.cyl(0.12, 0.09, 0.22, 7), mat('#ffffff')), mesh(G.cyl(0.11, 0.11, 0.02, 7), mat('#3a1a08'), [0, 0.11, 0])),
  ball: () => mesh(G.ball(0.3, 1), mat('#ffffff')),
  cat: () => catObj(0.75),
  fatcat: () => { const c = catObj(1.25, '#d8c8b8'); c.children[0].scale.multiply(new THREE.Vector3(1.25, 0.95, 1.1)); return c; },
  ...DISC_BUILD,
};
Object.assign(BUILD, friendBuild(MODELS, catObj), EPEKTASE_BUILD, PPROD_BUILD, SKANKY_BUILD, ANBUU_BUILD, RONARE_BUILD, PASS_BUILD);
// the thrown burger and bat use the real models too, where they exist (propModels.js)
for (const k of ['burger', 'bat']) { const f = BUILD[k]; BUILD[k] = () => fitProp(k, f()); }

export class EntityViews {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map();
    this.t = 0;
  }

  build(e) {
    let o;
    const k = e.kind;
    if (k === 'proj') o = (BUILD[e.look] || BUILD.ball)(e);
    else if (k === 'minion') { o = (HUMAN[e.look] || HUMAN.jogger)(); }
    else if (k === 'capball') o = BUILD.capball();
    else if (k === 'clingcat') o = e.look === 'greycat' ? greyCat(MODELS, catObj, 0.55) : catObj(0.6);
    else if (k === 'pet') o = petObj(MODELS, e.look || 'shiba');
    else if (PASS_KINDS[k]) o = PASS_KINDS[k](e);
    else if (k === 'beam') o = beamObj(e.look);
    else if (k === 'buddy') o = buddyObj(e.look, MODELS);
    else if (k === 'ring') {
      const c = { tungbeat: '#ffd23a', tung: '#e8a050', vinyl: '#ff5ab8', larsen: '#ff3b30', fart: '#9ad83a', bass: '#7a5aff', sound: '#7fd8ff', bark: '#ffe08a', funk: '#ff8a2a', shock: '#cdbb98' }[e.look] || '#ffffff';
      const thin = { shock: 0.07, bark: 0.045 }[e.look];
      o = mesh(new THREE.TorusGeometry(1, thin || 0.12, 4, 32), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: thin ? 0.5 : 0.85, depthWrite: false }), [0, 0.15, 0], [Math.PI / 2, 0, 0]);
      const g = grp(o); o = g;
    } else if (k === 'cloud') {
      o = grp();
      if (STYLE.smooth) {
        // soft billowing puffs
        const m = new THREE.SpriteMaterial({ map: puffTex(), color: { fart: '#9acb3a', vape: '#ffffff', ricard: '#f2e6a0' }[e.look] || '#f4f2ff', transparent: true, opacity: 0.32, depthWrite: false });
        // a light, compact cloud: the fighters stay visible through it (it is a hazard, not a curtain)
        for (let i = 0; i < 9; i++) { const b = new THREE.Sprite(m); b.position.set((Math.random() - 0.5) * 1.6, (Math.random() - 0.4) * 1.0, (Math.random() - 0.5) * 1.2); b.scale.setScalar(1.1 + Math.random() * 0.6); b.userData.ph = Math.random() * 6; b.userData.s0 = b.scale.x; b.material.rotation = Math.random() * 6; o.add(b); }
      } else {
        const m = new THREE.MeshLambertMaterial({ color: '#f8f8ff', transparent: true, opacity: 0.55, depthWrite: false, emissive: '#666670' });
        for (let i = 0; i < 9; i++) { const b = mesh(G.ball(0.55, 1), m, [(Math.random() - 0.5) * 1.6, (Math.random() - 0.4) * 1.0, (Math.random() - 0.5) * 1.6]); b.userData.ph = Math.random() * 6; o.add(b); }
      }
    } else if (k === 'puddle') {
      const c = { cheese: '#f6df8a', ketchup: '#c8141a', mustard: '#e8c21a', couscous: '#f2d38a', tears: '#8ad8ff', ricard: '#f2e6a0', spaghetti: '#e8b850' }[e.look] || '#ffffff';
      o = mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }), [0, 0.04, 0], [-Math.PI / 2, 0, 0]);
      const g = grp(o);
      if (e.look === 'spaghetti') { o.material.opacity = 0.12; for (let i = 0; i < 5; i++) { const n = noodles(0.42, 9); const a = i * 1.26; n.position.set(Math.cos(a) * 0.5 * (i % 2 ? 1 : 0.4), 0, Math.sin(a) * 0.5 * (i % 2 ? 1 : 0.4)); n.rotation.y = a; g.add(n); } }
      if (e.look === 'cheese') for (let i = 0; i < 14; i++) g.add(mesh(G.box(0.12, 0.03, 0.06), mat('#f2d77a'), [(Math.random() - 0.5) * 1.6, 0.06, (Math.random() - 0.5) * 1.6], [0, Math.random() * 3, 0]));
      o = g;
    } else if (k === 'stamp') {
      o = grp(
        mesh(G.box(3.6, 0.6, 2.2), mat('#5a2a12'), [0, 0.3, 0]),
        mesh(G.box(3.7, 0.12, 2.3), mat('#c4141a'), [0, 0.02, 0]),
        mesh(G.cyl(0.35, 0.45, 1.6, 8), mat('#3a1a08'), [0, 1.4, 0]),
        mesh(G.ball(0.6, 1), mat('#3a1a08'), [0, 2.3, 0]),
      );
      const warn = mesh(new THREE.RingGeometry(1.8, 2.4, 24), new THREE.MeshBasicMaterial({ color: '#ff2020', transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }), [0, 0.05, 0], [-Math.PI / 2, 0, 0]);
      o.userData.warn = warn;
      this.scene.add(warn);
    } else if (k === 'skybolt') {
      o = bolt(3);
    } else if (k === 'strike') {
      o = grp();
      const warn = mesh(new THREE.RingGeometry(0.8, 1, 28), new THREE.MeshBasicMaterial({ color: e.look === 'gas' ? '#7cff3a' : '#ff2a2a', transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }), [0, 0.06, 0], [-Math.PI / 2, 0, 0]);
      const fill = mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({ color: e.look === 'gas' ? '#3a8a1a' : '#ff2a2a', transparent: true, opacity: 0.2, depthWrite: false }), [0, 0.05, 0], [-Math.PI / 2, 0, 0]);
      o.add(warn, fill);
      if (e.look === 'catfall') {
        const c = catObj(2.6, '#e0b080'); c.rotation.x = -0.6;
        o.add(c); o.userData.fork = c;
      }
      if (e.look === 'fork') {
        const fork = grp(mesh(G.box(0.5, 6, 0.3), mat('#c7ccd4'), [0, 4, 0]), ...[-0.6, -0.2, 0.2, 0.6].map((x) => mesh(G.box(0.14, 2.2, 0.14), mat('#dfe3ea'), [x, 0.6, 0])), mesh(G.box(1.5, 0.4, 0.3), mat('#c7ccd4'), [0, 1.8, 0]));
        o.add(fork); o.userData.fork = fork;
      }
      o.userData.warn = warn; o.userData.fill = fill;
    } else if (k === 'sweeper') {
      if (e.look === 'cats') {
        o = grp();
        const tints = [null, '#7a7380', '#3a3438', '#e8e0d8', '#c89060'];
        for (let i = 0; i < 11; i++) { const c = catObj(0.8 + (i % 3) * 0.15, tints[i % tints.length]); c.position.set(-11 + i * 2.2, 0.5, (i % 2) * 0.6); c.userData.ph = i * 1.3; o.add(c); }
        o.userData.cats = true;
      } else if (e.look === 'wave') {
        o = grp(mesh(new THREE.BoxGeometry(26, 2.6, 1.4, 12, 2, 1), new THREE.MeshLambertMaterial({ color: '#3a8ad8', transparent: true, opacity: 0.8, emissive: '#0a2a4a' }), [0, 1.3, 0]),
          mesh(new THREE.BoxGeometry(26, 0.4, 1.6), mat('#eaf6ff'), [0, 2.6, 0.2]));
      } else {
        o = grp(mesh(new THREE.BoxGeometry(24, 0.9, 0.35), mat('#c7ccd4', { map: stripes('gr', '#c7ccd4', '#59616c', 8, 1, true) }), [0, 0.6, 0]),
          mesh(G.box(24, 0.1, 0.5), mat('#88909c'), [0, 1.1, 0]), mesh(G.cyl(0.3, 0.3, 4, 6), mat('#2a2a2a'), [0, 3.2, 0]));
      }
    } else o = mesh(G.ball(0.2, 0), basic('#ff00ff'));
    this.scene.add(o);
    return o;
  }

  // one of everything this can show, out of the scene (MatchView.prewarm compiles their shaders before the match)
  warmGroup() {
    const g = new THREE.Group(), scene = this.scene;
    this.scene = g;
    const looks = {
      proj: Object.keys(BUILD), minion: Object.keys(HUMAN), capball: [''], clingcat: ['', 'greycat'], pet: ['shiba'], beam: [''],
      buddy: ['cdman', 'vinylman'], ring: [''], cloud: ['', 'fart'], puddle: ['', 'spaghetti', 'cheese'], stamp: [''], skybolt: [''],
      strike: ['', 'catfall', 'fork'], sweeper: ['', 'cats', 'wave'], slick: ['ricard', 'poop'],
    };
    for (const [kind, ls] of Object.entries(looks)) {
      for (const look of ls) {
        try { this.build({ id: -1, kind, look, x: 0, y: 0, z: 0, vx: 1, vy: 0, vz: 0, a: 1, r: 0.5, t: 0, life: 60, owner: 0 }); } catch (err) { /* a look that needs more of its entity: compiled the first time it shows */ }
      }
    }
    // the energy balls (the charge in Pandrezz's palms, ANBUU's orb) and the pour of the Ricard: made by the rigs
    g.add(energyBall('kame'), streamObj('#ffffff'));
    this.scene = scene;
    return g;
  }

  update(entities, dt, stage) {
    this.t += dt;
    const seen = new Set();
    for (const e of entities) {
      seen.add(e.id);
      let o = this.map.get(e.id);
      if (!o) { o = this.build(e); this.map.set(e.id, o); o.userData.kind = e.kind; o.userData.px = e.x; o.userData.py = e.y; o.userData.pz = e.z; }
      this.place(o, e, dt, stage);
    }
    for (const [id, o] of this.map) {
      if (!seen.has(id)) {
        this.scene.remove(o);
        if (o.userData.warn) this.scene.remove(o.userData.warn);
        this.map.delete(id);
      }
    }
  }

  place(o, e, dt, stage) {
    // smooth toward the simulated position (entities are snapshot on clients)
    const k = 1 - Math.exp(-dt * 30);
    const u = o.userData;
    u.px += (e.x - u.px) * k; u.py += (e.y - u.py) * k; u.pz += (e.z - u.pz) * k;
    if (Math.hypot(e.x - u.px, e.z - u.pz) > 3) { u.px = e.x; u.py = e.y; u.pz = e.z; }
    o.position.set(u.px, u.py, u.pz);
    switch (e.kind) {
      case 'proj': {
        const dir = Math.atan2(e.vx, e.vz);
        o.rotation.set(0, dir, 0);
        if (e.look === 'bill') o.rotation.set((e.a || 0) * 2, dir, (e.a || 0));
        else if (['shard', 'bat', 'flammekueche'].includes(e.look)) o.rotation.set(0, (e.a || 0) * 3, 0);
        else if (e.look === 'heart') o.rotation.set(0, 0, Math.sin(this.t * 8) * 0.2);
        else if (e.look === 'soundwave' || e.look === 'chord') o.rotation.set(0, dir - Math.PI / 2, 0);
        else if (e.look === 'bug' || e.look === 'train' || e.look === 'waveform') o.rotation.set(0, dir, e.look === 'waveform' ? Math.sin(this.t * 14 + e.id) * 0.08 : 0);
        else if (e.look === 'jazznote') o.rotation.set(0, 0, Math.sin(this.t * 9 + e.id) * 0.3);
        else if (e.look === 'holy808') o.rotation.set(0, this.t * 2, 0);
        else if (e.look === 'blabla') o.rotation.set(0, 0, Math.sin(this.t * 9 + e.id) * 0.12); // a sprite: it faces the camera
        else if (e.look === 'popup' || e.look === 'coin') o.rotation.set(0, e.look === 'coin' ? (e.a || 0) : 0, e.look === 'popup' ? Math.sin(this.t * 6) * 0.15 : 0);
        else if (e.look === 'pizza') o.rotation.set(0, (e.a || 0), 0.15);
        else if (e.look === 'note' || e.look === 'bignote') o.rotation.set(0, 0, Math.sin(this.t * 11 + e.id) * 0.35); // facing the camera, bobbing
        else if (e.look === 'cd' || e.look === 'cdgold' || e.look === 'vinyl') { o.rotation.set(0, 0, 0); o.userData.disc.rotation.set(0.3, (e.a || 0), 0); }
        else if (e.look !== 'fry') o.rotation.x = (e.a || 0);
        break;
      }
      case 'ring': {
        const r = e.r || 1;
        o.scale.set(r, 1, r);
        o.children[0].material.opacity = Math.max(0, 1 - e.t / 30) * (e.look === 'shock' || e.look === 'bark' ? 0.5 : 1);
        break;
      }
      case 'cloud': {
        const s = (e.r || 2) * (e.s ?? 1) * (e.look === 'fart' ? 0.55 : 0.7);
        o.scale.setScalar(s);
        for (const b of o.children) { b.position.y += Math.sin(this.t * 2 + b.userData.ph) * 0.002; b.scale.setScalar((b.userData.s0 || 1) * (1 + Math.sin(this.t * 3 + b.userData.ph) * 0.12)); }
        const fade = e.life >= 0 && e.life < 40 ? e.life / 40 : 1;
        o.children.forEach((b) => { b.material.opacity = (e.look === 'fart' ? 0.17 : 0.32) * fade; }); // (the fart: a light haze, the fighters show through)
        break;
      }
      case 'puddle': {
        const r = e.r || 2;
        o.scale.set(r, 1, r);
        if (stage) { const s = stage.findLanding3(e.x, e.z, e.y + 1, e.y - 3); if (s) o.position.y = stage.heightAt(s, e.x, e.z); }
        const fade = e.life >= 0 && e.life < 60 ? e.life / 60 : 1;
        o.children[0].material.opacity = (e.look === 'spaghetti' ? 0.12 : 0.85) * fade; // the spaghetti: the noodles show, not a disc
        break;
      }
      case 'beam': updateBeam(o, e, this.t); break;
      case 'buddy': updateBuddy(o, e, dt, this.t); break;
      case 'pet': updatePet(o, e, dt, this.t); break;
      case 'clingcat': {
        o.rotation.set(-0.5 + Math.sin(this.t * 22 + e.id) * 0.25, (e.a || 0) + Math.PI, Math.sin(this.t * 17) * 0.3);
        break;
      }
      case 'minion': {
        if (u.cat) {
          const run = Math.hypot(e.vx, e.vz) > 0.5;
          o.rotation.set(e.st ? -0.8 : !e.grounded ? -0.35 : 0, e.a || 0, 0);
          o.position.y += run && e.grounded ? Math.abs(Math.sin(this.t * 15 + e.id)) * 0.14 : 0;
          break;
        }
        o.rotation.set(0, e.a || 0, 0);
        const run = Math.hypot(e.vx, e.vz) > 0.5;
        const b = Math.sin(this.t * 16 + e.id);
        o.children[6] && (o.children[6].position.z = 0.04 + (run ? b * 0.18 : 0));
        o.children[7] && (o.children[7].position.z = 0.04 - (run ? b * 0.18 : 0));
        o.children[0].rotation.x = run ? 0.25 : 0;
        if (e.st) o.rotation.x = -0.6; else o.rotation.x = 0;
        break;
      }
      case 'capball': {
        o.rotation.z = e.a || 0;
        o.scale.setScalar(2.2);
        break;
      }
      case 'stamp': {
        const h = e.h ?? 8;
        o.position.y = u.py + h;
        o.rotation.y = e.a || 0;
        const w = o.userData.warn;
        w.position.set(e.x, e.y + 0.06, e.z);
        w.material.opacity = h > 0.2 ? 0.35 + 0.35 * Math.sin(this.t * 20) : 0;
        break;
      }
      case 'skybolt': o.visible = true; break;
      case 'strike': {
        const r = e.r || 1.8;
        o.scale.set(r, 1, r);
        const t = e.t / (e.warn || 70);
        o.userData.warn.material.opacity = t < 1 ? 0.4 + 0.5 * Math.abs(Math.sin(this.t * (6 + t * 18))) : 0;
        o.userData.fill.material.opacity = t < 1 ? 0.1 + t * 0.3 : 0;
        if (o.userData.fork) { const f = o.userData.fork; f.scale.set(1 / r, 1, 1 / r); f.position.y = t < 1 ? 8 - t * 1.5 : Math.max(0, 8 - 1.5 - (e.t - e.warn) * 2.5); }
        break;
      }
      case 'sweeper': {
        o.rotation.y = e.a || 0;
        o.visible = e.t > (e.warn || 90) - 60;
        if (e.look === 'grater') o.children[0].position.y = 0.6 + Math.sin(this.t * 30) * 0.03;
        if (u.cats) for (const c of o.children) { c.position.y = 0.5 + Math.abs(Math.sin(this.t * 13 + c.userData.ph)) * 0.45; c.rotation.x = -0.3 + Math.sin(this.t * 13 + c.userData.ph) * 0.25; }
        break;
      }
      default: break;
    }
    // a look with its own motion (passView.js)
    if (o.userData.upd) o.userData.upd(o, e, this.t, dt);
  }

  clear() { for (const [, o] of this.map) { this.scene.remove(o); if (o.userData.warn) this.scene.remove(o.userData.warn); } this.map.clear(); }
}

export { glowTex };
