// Looks of the big animation pass (16 Oct 2026): the props in hand and the thrown things of the new moves. Each one
// is a simple shape replaced by its Meshy model when it is loaded (propModels.js: fitProp keeps the shape's size and
// place), so the hitboxes in src/sim/chars/*.js match what is drawn. Entity builders may set userData.upd(o, e, t)
// for their own motion (entityView.js calls it every frame).
import * as THREE from 'three';
import { puddleMat } from './fxShaders.js';
import { mat, G, mesh, glowTex } from './materials.js';
import { fitProp } from './propModels.js';

const grp = (...c) => { const g = new THREE.Group(); c.forEach((o) => o && g.add(o)); return g; };
// a model a little darker or tinted, to match the colours of the character's own (the materials are shared: once)
function tint(o, k) {
  o.traverse((m) => { if (m.isMesh && m.material && !m.material.userData.tinted) { m.material.color.multiplyScalar(k); m.material.userData.tinted = 1; } });
  return o;
}

// --- shapes (sized like the real objects; the models take their size) ----------------------------------------------
function capShape(s = 1) {
  // a baseball cap: the crown and the brim in front (+Z)
  const crown = mesh(new THREE.SphereGeometry(0.15 * s, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#c9a77a'));
  const brim = mesh(G.box(0.24 * s, 0.025 * s, 0.14 * s), mat('#4a3020'), [0, 0.01 * s, 0.17 * s]);
  return grp(crown, brim);
}
// the money of PPROD's neutral A, and his old PC and screen (Meshy models over plain shapes)
const goldM = () => mat('#f2c230', { metalness: 0.6, roughness: 0.3 });
const SHAPES = {
  coin: () => mesh(G.cyl(0.16, 0.16, 0.04, 14), goldM(), [0, 0, 0], [Math.PI / 2, 0, 0]),
  coinpile: () => grp(...[0, 1, 2, 3, 4].map((i) => mesh(G.cyl(0.12, 0.12, 0.035, 12), goldM(), [(i % 3 - 1) * 0.12, 0.02 + Math.floor(i / 3) * 0.04, (i % 2) * 0.08]))),
  billwad: () => grp(mesh(G.box(0.36, 0.1, 0.18), mat('#5ea54a'), [0, 0, 0]), mesh(G.box(0.06, 0.11, 0.19), mat('#d8b070'), [0, 0, 0])),
  diamond: () => mesh(new THREE.OctahedronGeometry(0.16, 0), mat('#bfe8ff', { metalness: 0.2, roughness: 0.05 }), [0, 0, 0], null, [1, 1.1, 1]),
  goldbar: () => mesh(G.box(0.34, 0.12, 0.16), goldM(), [0, 0, 0]),
  monitor: () => grp(mesh(G.box(0.62, 0.4, 0.05), mat('#222428'), [0, 0.22, 0]), mesh(G.box(0.08, 0.16, 0.06), mat('#333'), [0, -0.05, 0]), mesh(G.box(0.28, 0.03, 0.18), mat('#333'), [0, -0.13, 0])),
  crtpc: () => grp(mesh(G.box(0.46, 0.4, 0.42), mat('#e0d8c4'), [0, 0.3, 0]), mesh(G.box(0.48, 0.2, 0.46), mat('#d8d0bc'), [0, 0, 0])),
  // SKANKY's stage microphone: the handle along +Z out of the palm, the mesh head at its end
  mic: () => grp(mesh(G.cyl(0.03, 0.022, 0.2, 10), mat('#1a1a1c', { roughness: 0.5 }), [0, 0, 0.1], [Math.PI / 2, 0, 0]), mesh(G.ball(0.05, 1), mat('#c8ccd2', { metalness: 0.7, roughness: 0.35 }), [0, 0, 0.23])),
};
const made = (k, s = 1) => { const o = fitProp(k, SHAPES[k]()); if (s !== 1) o.scale.multiplyScalar(s); return o; };

export const PASS_PROPS = {
  coin: () => made('coin'), coinpile: () => made('coinpile'), billwad: () => made('billwad'), diamond: () => made('diamond'), goldbar: () => made('goldbar'),
  monitor: () => made('monitor'), crtpc: () => made('crtpc'),
  mic: () => made('mic'),
  // Tices' cap in his hand (the crown down in the palm, the brim out)
  cap: () => { const c = tint(fitProp('cap', capShape(1)), 0.82); c.rotation.set(Math.PI / 2, 0, 0); return grp(c); },
};

// --- thrown / lying things (entityView.js BUILD) -------------------------------------------------------------------
// a ball of fire: a hot core, a flickering glow around it
function fireball(r = 0.4) {
  const core = mesh(new THREE.IcosahedronGeometry(r * 0.75, 1), new THREE.MeshBasicMaterial({ color: '#fff0a0' }));
  const shell = mesh(new THREE.IcosahedronGeometry(r, 1), new THREE.MeshBasicMaterial({ color: '#ff7a1a', transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#ff6a1a', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.setScalar(r * 3.2);
  const g = grp(core, shell, glow);
  g.userData.upd = (o, e, t) => { const k = 1 + Math.sin(t * 47 + e.id) * 0.12; shell.scale.setScalar(k); glow.scale.setScalar(r * 3.2 * (0.9 + Math.sin(t * 31) * 0.1)); shell.rotation.set(t * 7, t * 9, 0); };
  return g;
}
// a puddle on the floor (the slicks: src/sim/chars/friendKit.js): a real liquid (src/render/fxShaders.js puddleMat):
// a blob, a meniscus, the sky in it, ripples; the Ricard milky and opaque, the tears clear
const SLICK = { ricard: ['#c8a948', 0.82, 0.6], tears: ['#4f8fc8', 0.38, 0] };
function poopShape() {
  const m = mat('#6a3a1a', { roughness: 0.4 });
  return grp(mesh(G.ball(0.24, 1), m, [0, 0.12, 0], null, [1, 0.6, 1]), mesh(G.ball(0.17, 1), m, [0, 0.27, 0], null, [1, 0.7, 1]), mesh(G.ball(0.1, 1), m, [0, 0.39, 0]));
}
function slickObj(e) {
  // the shiba's poop: the model, standing where it fell (flies included), a little wobble
  if (e.look === 'poop') {
    const p = fitProp('poop', poopShape());
    const g = grp(p);
    g.userData.upd = (o, en, t) => { const k = Math.min(1, en.t / 8); o.scale.set(k * (1 + Math.sin(t * 3 + en.id) * 0.03), k, k); };
    return g;
  }
  const [c, op, milk] = SLICK[e.look] || ['#ffffff', 0.8, 0];
  const m = puddleMat(c, { op, milk });
  const disc = mesh(new THREE.CircleGeometry(1, 64), m, [0, 0.035, 0], [-Math.PI / 2, 0, 0]);
  const g = grp(disc);
  const r = e.r || 1.5;
  g.userData.upd = (o, en, t) => {
    // it spreads out fast where it lands, then settles (a ring of its splash runs across it)
    const k = 1 - Math.pow(1 - Math.min(1, en.t / 14), 3), fade = en.life < 30 ? en.life / 30 : 1;
    o.scale.set(r * 1.15 * k, 1, r * 0.62 * k);
    const U = m.uniforms; U.uTime.value = t; U.uFade.value = fade; U.uBirth.value = Math.min(1, en.t / 30);
  };
  return g;
}

export const PASS_BUILD = {
  // Kerrian's syringe thrown like a dart (its needle forward: +z, the way it flies)
  syringe: () => {
    const r = [Math.PI / 2, 0, 0];
    return new THREE.Group().add(
      mesh(G.cyl(0.05, 0.05, 0.3, 10), mat('#e8f4ff', { transparent: true, opacity: 0.8 }), [0, 0, 0], r),
      mesh(G.cyl(0.038, 0.038, 0.26, 8), mat('#ffb000', { emissive: '#4a3000' }), [0, 0, 0.01], r),
      mesh(G.cyl(0.07, 0.07, 0.02, 10), mat('#d8dde4'), [0, 0, -0.2], r),
      mesh(G.cyl(0.006, 0.006, 0.16, 4), mat('#c0c6cf'), [0, 0, 0.23], r));
  },
  // PPROD's money thrown, spinning; his old PC tumbling
  coin: () => spinning(made('coin', 1.4), 'y'), coinpile: () => spinning(made('coinpile', 1.3), 'z'), billwad: () => spinning(made('billwad', 1.3), 'z'),
  diamond: () => spinning(made('diamond', 1.4), 'y'), goldbar: () => spinning(made('goldbar', 1.3), 'z'),
  crtpc: () => spinning(made('crtpc', 1.15), 'z'),
  // Epektase's guitar spinning over his head like a saw (up smash): the model, turning in the plane of the fight,
  // a red glow on its edge
  guitarSpin: () => {
    const shape = grp(mesh(G.box(0.12, 1.2, 0.05), mat('#c0201a'), [0, 0, 0]), mesh(G.box(0.55, 0.45, 0.06), mat('#c0201a'), [0, -0.45, 0]));
    const gtr = fitProp('guitar', shape);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#ff3b30', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(1.4);
    const spin = grp(gtr);
    const g = grp(spin, glow);
    g.userData.upd = (o, e, t) => { o.rotation.set(0, 0, 0); spin.rotation.set(0.25, 0, -(e.a || 0) * 1.4); glow.material.opacity = e.t < 84 ? 0.22 + Math.sin(t * 40) * 0.08 : 0.1; };
    return g;
  },
  fireball: () => fireball(0.42),
  // the cap flying like a boomerang: flat, spinning
  cap: () => {
    const c = tint(fitProp('cap', capShape(1.25)), 0.82);
    const g = grp(c);
    g.userData.upd = (o, e) => { o.rotation.set(0, (e.a || 0) * 1.5, e.mode === 'v' ? 0.5 : 0.15); };
    return g;
  },
};

// a thrown thing turning about one axis (e.a: its spin, from the simulation)
function spinning(o, axis) {
  const g = grp(o);
  g.userData.upd = (oo, e) => { oo.rotation.set(0, 0, 0); o.rotation.set(axis === 'x' ? e.a || 0 : 0, axis === 'y' ? (e.a || 0) * 1.5 : 0, axis === 'z' ? -(e.a || 0) : 0); };
  return g;
}

// the new kinds of entities (not projectiles): kind -> builder
export const PASS_KINDS = {
  // burning / poisoned: nothing to draw, the flames and bubbles are particles (friendsView.js, passFx.js)
  burn: () => new THREE.Group(),
  slick: (e) => slickObj(e),
};
