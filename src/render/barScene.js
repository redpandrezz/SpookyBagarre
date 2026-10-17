// Le bar du menu principal (« ALLER AU BAR », src/ui/bar.js) : la salle en 3D, faite en code dans le style des arènes
// (bois, pierre, bougies, toiles d'araignée, citrouilles, un squelette derrière le comptoir).
//   buildBar() -> { group, update(dt, t), blockers, spots, door, counter, barman, dispose() }
// Repère : x de gauche à droite, z vers la caméra, le comptoir au fond (z < 0), la porte de sortie dans le mur de gauche.
import * as THREE from 'three';
import { mat, basic, G, mesh, canvasTex, glowTex } from './materials.js';
import { Bats } from './stages/common.js';
import { fitProp, hasProp } from './propModels.js';
import { STYLE } from './style.js';

export const ROOM = { x0: -11, x1: 11, z0: -6.5, z1: 6.5 };
const COUNTER = { x0: -6, x1: 6, z: -4.3, d: 0.9, h: 1.15 };
const TABLES = [[-7.4, 0.9], [-3.4, 3.0], [3.4, 3.0], [7.4, 1.1]];
const STOOLS = [-5.2, -3.6, -2.0, 2.0, 3.6, 5.2];
export const DOOR = { x: ROOM.x0, z: 3.6, w: 1.7 };
const DANCE = { x: 8.4, z: -3.3, r: 1.5 };

// où se tiennent les potes : [x, z, regard (radians, 0 = vers la caméra), rôle]
//   'bar' accoudé au comptoir, 'table' autour d'une table, 'dance' sur la piste, 'darts' aux fléchettes
export const SPOTS = [
  // (le milieu du comptoir reste libre : on y commande au barman)
  [-1.5, -3.2, 0.15, 'bar'], [1.5, -3.2, -0.15, 'bar'], [-2.8, -3.2, 0.3, 'bar'], [2.8, -3.2, -0.3, 'bar'],
  [-4.4, -3.2, 0.4, 'bar'], [4.4, -3.2, -0.4, 'bar'],
  ...TABLES.flatMap(([x, z], i) => {
    const a = i % 2 ? 0.6 : -0.6; // deux autour de chaque table, face à face (un peu tournés vers la caméra)
    const p = (k) => { const ang = a + k * Math.PI; return [x + Math.sin(ang) * 1.05, z + Math.cos(ang) * 0.95]; };
    const [x1, z1] = p(0), [x2, z2] = p(1);
    return [[x1, z1, Math.atan2(x - x1, z - z1) + 0.5, 'table'], [x2, z2, Math.atan2(x - x2, z - z2) - 0.5, 'table']];
  }),
  [DANCE.x - 0.7, DANCE.z + 0.4, 0.4, 'dance'], [DANCE.x + 0.75, DANCE.z - 0.3, -0.5, 'dance'],
  [DANCE.x + 0.1, DANCE.z + 1.15, 0.15, 'dance'], // (21 friends around the player since Ronare and Kerrian: one spot each)
  [-9.0, -3.4, -1.25, 'darts'],
  [-6.2, 4.9, 0.6, 'coffin'], [7.2, 4.6, -0.5, 'pumpkin'],
  [9.6, -0.9, -1.0, 'jukebox'],
];

// ---- textures -------------------------------------------------------------------------------------------------------
let clones = []; // les textures répétées de cette salle (les originales sont partagées : gardées)
function repeated(tex, rx, ry) { const t = tex.clone(); t.repeat.set(rx, ry); t.needsUpdate = true; clones.push(t); return t; }

const planks = () => canvasTex('barPlanks', 128, (g, s) => {
  const cols = ['#4a2f1c', '#553622', '#3f2817', '#5c3b25'];
  for (let i = 0; i < 4; i++) {
    g.fillStyle = cols[i]; g.fillRect(i * 32, 0, 32, s);
    for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(0,0,0,${0.06 + ((k * 37 + i * 11) % 10) / 90})`; g.fillRect(i * 32 + 2 + ((k * 13) % 26), 0, 1, s); }
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(i * 32, 0, 2, s);
    g.fillRect(i * 32, (i * 47) % s, 32, 2); // joint de deux planches
    g.fillStyle = '#20140b'; g.fillRect(i * 32 + 6, ((i * 47) % s) + 6, 2, 2); g.fillRect(i * 32 + 24, ((i * 47) % s) + 6, 2, 2); // clous
  }
});
const stone = () => canvasTex('barStone', 128, (g, s) => {
  g.fillStyle = '#1c1722'; g.fillRect(0, 0, s, s);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
    const v = 0.78 + (((x * 7 + y * 13) % 9) / 9) * 0.35;
    const c = new THREE.Color('#5a5266').multiplyScalar(v);
    g.fillStyle = '#' + c.getHexString();
    g.fillRect(x * 32 + (y % 2) * 16 - 16 + 1, y * 16 + 1, 30, 14);
    g.fillRect(x * 32 + (y % 2) * 16 + 16 + 1, y * 16 + 1, 30, 14);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x * 32 + 4 + (y * 5) % 18, y * 16 + 4, 5, 3);
  }
  // un peu de mousse verdâtre dans les joints
  for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(80,120,60,0.25)'; g.fillRect((i * 53) % s, ((i * 29) % 8) * 16 + 14, 6 + (i % 5), 2); }
});
const wood = () => canvasTex('barWood', 64, (g, s) => {
  g.fillStyle = '#3a2416'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(0,0,0,${0.1 + (i % 4) * 0.05})`; g.fillRect(0, (i * 11) % s, s, 1); }
  for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(255,200,140,0.06)'; g.fillRect(0, i * 16 + 3, s, 2); }
});
// une toile d'araignée (fond transparent)
const webTex = () => canvasTex('barWeb', 256, (g, s) => {
  g.clearRect(0, 0, s, s);
  g.strokeStyle = 'rgba(235,235,245,0.75)'; g.lineWidth = 1.6;
  const cx = 0, cy = 0, n = 9, R = s * 1.0; // un coin de toile : centre dans le coin haut-gauche
  const ang = (i) => (i / (n - 1)) * Math.PI / 2;
  for (let i = 0; i < n; i++) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ang(i)) * R, cy + Math.sin(ang(i)) * R); g.stroke(); }
  g.lineWidth = 1.1;
  for (let r = 22; r < R; r += 22 + r * 0.08) {
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const a = ang(i), sag = 1 - 0.12 * Math.sin((i % 2 ? 1 : 0.3) * 1.5);
      const x = cx + Math.cos(a) * r * sag, y = cy + Math.sin(a) * r * sag;
      i ? g.quadraticCurveTo(cx + Math.cos(a - 0.1) * r * 0.86, cy + Math.sin(a - 0.1) * r * 0.86, x, y) : g.moveTo(x, y);
    }
    g.stroke();
  }
});
// l'enseigne au néon au-dessus du comptoir
function signTex(text, color, w = 512, h = 128, font = 72) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.font = `${font}px 'Creepster', 'Lilita One', sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 24; g.fillStyle = color;
  g.fillText(text, w / 2, h / 2 + 4);
  g.shadowBlur = 6; g.fillStyle = '#ffffff'; g.globalAlpha = 0.85;
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- petits objets --------------------------------------------------------------------------------------------------
function glow(color, size, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size);
  return s;
}

export function candle(h = 0.28) {
  const g = new THREE.Group();
  g.add(mesh(G.cyl(0.06, 0.07, h, 8), mat('#efe4c8', { emissive: '#3a2a10', emissiveIntensity: 0.4 }), [0, h / 2, 0]));
  g.add(mesh(G.cyl(0.075, 0.09, 0.05, 8), mat('#d8cba8'), [0, h * 0.15, 0], null, [1.25, 1, 1.25])); // la cire qui a coulé
  const f = mesh(G.cone(0.035, 0.11, 6), basic('#ffd27a'), [0, h + 0.06, 0]);
  const halo = glow('#ffae48', 0.55, 0.9);
  halo.position.y = h + 0.07;
  g.add(f, halo);
  g.userData = { flame: f, halo, ph: Math.random() * 10 };
  return g;
}

// une chope de bière (mousse comprise), haute d'environ 0,26 m
export function mug() {
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: '#f0a020', emissive: '#6a3a00', emissiveIntensity: 0.55, roughness: 0.25, transparent: true, opacity: 0.88 });
  g.add(mesh(G.cyl(0.085, 0.075, 0.22, 10), glass, [0, 0.11, 0]));
  g.add(mesh(G.ball(0.09, 1), mat('#fff8e8', { emissive: '#605040', emissiveIntensity: 0.4 }), [0, 0.23, 0], null, [1, 0.45, 1]));
  const handle = mesh(new THREE.TorusGeometry(0.055, 0.016, 6, 12, Math.PI * 1.2), new THREE.MeshStandardMaterial({ color: '#f6d9a0', transparent: true, opacity: 0.7, roughness: 0.2 }), [0.09, 0.12, 0], [0, 0, -Math.PI * 0.6]);
  g.add(handle);
  return g;
}

function bottle(color, h = 0.42) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.2, transparent: true, opacity: 0.9 });
  g.add(mesh(G.cyl(0.075, 0.08, h * 0.65, 8), m, [0, h * 0.325, 0]));
  g.add(mesh(G.cyl(0.028, 0.06, h * 0.2, 8), m, [0, h * 0.75, 0]));
  g.add(mesh(G.cyl(0.03, 0.03, h * 0.12, 6), mat('#2a1a10'), [0, h * 0.9, 0]));
  return g;
}

function stool() {
  const g = new THREE.Group();
  const w = mat('#3a2416', { map: wood() });
  g.add(mesh(G.cyl(0.3, 0.27, 0.1, 12), mat('#6a1c24'), [0, 0.8, 0]));
  g.add(mesh(G.cyl(0.05, 0.07, 0.75, 6), mat('#8a6a3a', { metalness: 0.6, roughness: 0.4 }), [0, 0.38, 0]));
  g.add(mesh(G.cyl(0.24, 0.26, 0.05, 10), w, [0, 0.03, 0]));
  g.add(mesh(new THREE.TorusGeometry(0.2, 0.02, 5, 14), mat('#8a6a3a', { metalness: 0.6, roughness: 0.4 }), [0, 0.32, 0], [Math.PI / 2, 0, 0]));
  return g;
}

function table() {
  const g = new THREE.Group();
  const w = mat('#3a2416', { map: wood() });
  g.add(mesh(G.cyl(0.72, 0.72, 0.08, 18), w, [0, 0.95, 0]));
  g.add(mesh(G.cyl(0.08, 0.12, 0.92, 8), mat('#2a1a10'), [0, 0.47, 0]));
  g.add(mesh(G.cyl(0.36, 0.42, 0.06, 12), mat('#2a1a10'), [0, 0.03, 0]));
  // une bougie plantée dans un crâne, deux chopes
  const sk = skull(0.13); sk.position.set(0.12, 0.99, 0.05); g.add(sk);
  const c = candle(0.22); c.position.set(0.12, 1.2, 0.05); g.add(c);
  const m1 = mug(); m1.position.set(-0.32, 0.99, 0.2); m1.rotation.y = 1.2; g.add(m1);
  const m2 = mug(); m2.position.set(-0.1, 0.99, -0.38); m2.rotation.y = -0.6; g.add(m2);
  g.userData.candle = c;
  return g;
}

function skull(r = 0.15) {
  const g = new THREE.Group();
  const bone = mat('#e9dfc4');
  const dark = basic('#120a0c');
  g.add(mesh(G.ball(r, 1), bone, [0, r, 0], null, [1, 0.95, 1.05]));
  g.add(mesh(G.box(r * 1.1, r * 0.5, r * 0.9), bone, [0, r * 0.35, r * 0.25]));
  g.add(mesh(G.ball(r * 0.27, 1), dark, [-r * 0.38, r * 1.05, r * 0.82]), mesh(G.ball(r * 0.27, 1), dark, [r * 0.38, r * 1.05, r * 0.82]));
  g.add(mesh(G.cone(r * 0.12, r * 0.25, 3), dark, [0, r * 0.72, r * 0.95], [Math.PI, 0, 0]));
  return g;
}

function pumpkin(r = 0.4) {
  const g = new THREE.Group();
  const m = mat('#e8741c', { emissive: '#5a1c00', emissiveIntensity: 0.5 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(mesh(G.ball(r * 0.62, 1), m, [Math.cos(a) * r * 0.42, r * 0.72, Math.sin(a) * r * 0.42], null, [0.8, 1, 0.8]));
  }
  g.add(mesh(G.cyl(0.04, 0.06, r * 0.4, 5), mat('#3a5a20'), [0, r * 1.45, 0], [0.2, 0, 0.1]));
  const face = basic('#ffd040', { toneMapped: false });
  g.add(mesh(G.cone(r * 0.14, r * 0.2, 3), face, [-r * 0.25, r * 0.9, r * 0.92], [Math.PI / 2, 0, 0]));
  g.add(mesh(G.cone(r * 0.14, r * 0.2, 3), face, [r * 0.25, r * 0.9, r * 0.92], [Math.PI / 2, 0, 0]));
  g.add(mesh(G.box(r * 0.6, r * 0.12, r * 0.1), face, [0, r * 0.5, r * 0.95]));
  const h = glow('#ff9a20', r * 3, 0.55); h.position.set(0, r * 0.8, r * 0.6);
  g.add(h);
  g.userData.halo = h;
  g.userData.lit = { m, face, ph: Math.random() * 10 }; // allumée de l'intérieur : la bougie vacille (bar : update)
  return g;
}

function coffin() {
  const g = new THREE.Group();
  const w = mat('#2a1a14', { map: wood() });
  const shape = new THREE.Shape([[-0.35, -1], [0.35, -1], [0.55, 0.45], [0.38, 1], [-0.38, 1], [-0.55, 0.45]].map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false });
  const c = new THREE.Mesh(geo, w);
  c.rotation.x = -Math.PI / 2; c.position.y = 0.02;
  g.add(c);
  g.add(mesh(G.box(0.08, 0.02, 0.8), mat('#c8a050', { metalness: 0.7, roughness: 0.3 }), [0, 0.53, 0.1]));
  g.add(mesh(G.box(0.4, 0.02, 0.08), mat('#c8a050', { metalness: 0.7, roughness: 0.3 }), [0, 0.53, 0.25]));
  return g;
}

function keg() {
  const g = new THREE.Group();
  g.add(mesh(G.cyl(0.42, 0.42, 1.0, 14), mat('#5a3a20', { map: wood() }), [0, 0.5, 0]));
  g.add(mesh(G.ball(0.46, 1), mat('#5a3a20', { map: wood() }), [0, 0.5, 0], null, [1, 0.8, 1]));
  for (const y of [0.16, 0.84]) g.add(mesh(new THREE.TorusGeometry(0.45, 0.025, 5, 18), mat('#3a3a40', { metalness: 0.7 }), [0, y, 0], [Math.PI / 2, 0, 0]));
  return g;
}

// le barman : un squelette qui essuie un verre (le haut du corps dépasse du comptoir)
function barmanSkel() {
  const g = new THREE.Group();
  const bone = mat('#e9dfc4');
  const dark = basic('#120a0c');
  g.add(mesh(G.cyl(0.05, 0.05, 0.9, 6), bone, [0, 1.15, 0])); // la colonne
  for (let i = 0; i < 4; i++) g.add(mesh(new THREE.TorusGeometry(0.2 - i * 0.02, 0.025, 5, 14, Math.PI * 1.6), bone, [0, 1.25 + i * 0.13, 0.02], [Math.PI / 2, 0, Math.PI * 0.7]));
  g.add(mesh(G.box(0.55, 0.06, 0.12), bone, [0, 1.72, 0])); // les épaules
  // tablier de barman
  g.add(mesh(G.box(0.5, 0.6, 0.04), mat('#1a1418'), [0, 1.0, 0.14]));
  const head = new THREE.Group();
  head.add(mesh(G.ball(0.21, 1), bone, [0, 0.21, 0], null, [1, 1, 1.05]));
  head.add(mesh(G.box(0.24, 0.12, 0.18), bone, [0, 0.06, 0.06]));
  head.add(mesh(G.ball(0.06, 1), dark, [-0.08, 0.24, 0.17]), mesh(G.ball(0.06, 1), dark, [0.08, 0.24, 0.17]));
  const eyeL = glow('#9dff3a', 0.16), eyeR = glow('#9dff3a', 0.16);
  eyeL.position.set(-0.08, 0.24, 0.2); eyeR.position.set(0.08, 0.24, 0.2);
  head.add(eyeL, eyeR);
  // nœud papillon
  head.add(mesh(G.cone(0.05, 0.1, 3), mat('#a01020'), [-0.05, -0.04, 0.1], [0, 0, Math.PI / 2]), mesh(G.cone(0.05, 0.1, 3), mat('#a01020'), [0.05, -0.04, 0.1], [0, 0, -Math.PI / 2]));
  head.position.y = 1.78;
  g.add(head);
  const arm = (sx) => {
    const a = new THREE.Group();
    a.add(mesh(G.cyl(0.03, 0.03, 0.42, 5), bone, [0, -0.21, 0]));
    const fore = new THREE.Group();
    fore.add(mesh(G.cyl(0.026, 0.026, 0.38, 5), bone, [0, -0.19, 0]));
    fore.add(mesh(G.ball(0.05, 1), bone, [0, -0.4, 0]));
    fore.position.y = -0.42;
    a.add(fore);
    a.position.set(sx * 0.28, 1.7, 0);
    a.userData.fore = fore;
    g.add(a);
    return a;
  };
  const armL = arm(-1), armR = arm(1);
  const glass = mug();
  glass.scale.setScalar(0.9);
  glass.position.set(0, -0.48, 0.02);
  armL.userData.fore.add(glass);
  const rag = mesh(G.box(0.14, 0.02, 0.12), mat('#d8d0c0'), [0, -0.44, 0.02]);
  armR.userData.fore.add(rag);
  g.userData = { head, armL, armR, eyeL, eyeR };
  return g;
}

// ---- la salle ---------------------------------------------------------------------------------------------------------
export function buildBar() {
  const group = new THREE.Group();
  const anim = []; // (dt, t) => ...
  const W = ROOM.x1 - ROOM.x0, D = ROOM.z1 - ROOM.z0, H = 6.4;

  // lumière : une nuit violette, les bougies et le lustre font le reste
  group.add(new THREE.HemisphereLight('#8a78c0', '#2a1a22', 1.1));
  const key = new THREE.DirectionalLight('#ffd6a8', 1.15);
  key.position.set(4, 14, 9);
  key.target.position.set(0, 0, -1);
  if (STYLE.shadows) {
    key.castShadow = true;
    const c = key.shadow.camera;
    c.left = -14; c.right = 14; c.top = 10; c.bottom = -10; c.near = 2; c.far = 40;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0005; key.shadow.normalBias = 0.04; key.shadow.radius = 3;
  }
  group.add(key, key.target);

  // le sol, les murs
  const floor = mesh(new THREE.PlaneGeometry(W, D + 4), mat('#ffffff', { map: repeated(planks(), W / 3, (D + 4) / 3) }), [0, 0, 2], [-Math.PI / 2, 0, 0]);
  floor.receiveShadow = true;
  group.add(floor);
  const stoneMat = (rx, ry) => mat('#ffffff', { map: repeated(stone(), rx, ry) });
  const back = mesh(new THREE.PlaneGeometry(W, H), stoneMat(W / 3, H / 3), [0, H / 2, ROOM.z0]);
  back.receiveShadow = true;
  group.add(back);
  for (const sx of [-1, 1]) {
    const side = mesh(new THREE.PlaneGeometry(D + 4, H), stoneMat((D + 4) / 3, H / 3), [sx * ROOM.x1, H / 2, 2], [0, -sx * Math.PI / 2, 0]);
    side.receiveShadow = true;
    group.add(side);
  }
  // plinthes et poutres le long des murs
  const beam = mat('#2a1a10', { map: wood() });
  group.add(mesh(G.box(W, 0.35, 0.3), beam, [0, H - 0.2, ROOM.z0 + 0.15]));
  for (const x of [-7.5, 7.5]) group.add(mesh(G.box(0.4, H, 0.35), beam, [x, H / 2, ROOM.z0 + 0.18]));
  for (const sx of [-1, 1]) group.add(mesh(G.box(0.3, 0.35, D + 4), beam, [sx * (ROOM.x1 - 0.15), H - 0.2, 2]));

  // le comptoir
  const cw = COUNTER.x1 - COUNTER.x0;
  const front = mat('#ffffff', { map: repeated(wood(), cw / 1.2, 1) });
  group.add(mesh(G.box(cw, COUNTER.h - 0.1, COUNTER.d), front, [0, (COUNTER.h - 0.1) / 2, COUNTER.z]));
  const top = mesh(G.box(cw + 0.3, 0.12, COUNTER.d + 0.25), mat('#6a4028', { map: wood(), roughness: 0.45 }), [0, COUNTER.h - 0.03, COUNTER.z]);
  group.add(top);
  // panneaux sculptés et repose-pieds en laiton
  for (let x = COUNTER.x0 + 0.75; x < COUNTER.x1; x += 1.5) group.add(mesh(G.box(1.1, 0.6, 0.04), mat('#2e1c10'), [x, 0.55, COUNTER.z + COUNTER.d / 2 + 0.01]));
  const brass = mat('#c89a40', { metalness: 0.75, roughness: 0.3 });
  group.add(mesh(G.cyl(0.035, 0.035, cw, 8), brass, [0, 0.22, COUNTER.z + COUNTER.d / 2 + 0.22], [0, 0, Math.PI / 2]));
  // les pompes à bière, des chopes posées, des bougies
  for (const x of [-0.8, 0, 0.8]) {
    const tap = new THREE.Group();
    tap.add(mesh(G.cyl(0.05, 0.07, 0.45, 8), brass, [0, 0.22, 0]));
    tap.add(mesh(G.cyl(0.03, 0.03, 0.2, 6), brass, [0, 0.4, 0.09], [Math.PI / 2, 0, 0]));
    tap.add(mesh(G.cyl(0.035, 0.025, 0.32, 6), mat('#1a1418'), [0, 0.62, 0]));
    tap.add(mesh(G.ball(0.05, 1), basic(x ? '#9dff3a' : '#ff6a20'), [0, 0.8, 0]));
    tap.position.set(x, COUNTER.h + 0.03, COUNTER.z - 0.15);
    group.add(tap);
  }
  const counterCandles = [];
  for (const x of [-5.3, -2.4, 2.4, 5.3]) { const c = candle(0.3); c.position.set(x, COUNTER.h + 0.03, COUNTER.z - 0.1); group.add(c); counterCandles.push(c); }
  for (const [x, ry] of [[-4.0, 0.5], [-1.6, -0.3], [1.7, 1.1], [3.2, -0.8], [4.7, 0.2]]) { const m = mug(); m.position.set(x, COUNTER.h + 0.03, COUNTER.z + 0.15); m.rotation.y = ry; group.add(m); }
  const sk = skull(0.16); sk.position.set(-3.1, COUNTER.h + 0.03, COUNTER.z - 0.05); sk.rotation.y = 0.4; group.add(sk);

  // les étagères à bouteilles derrière le comptoir
  const shelfZ = ROOM.z0 + 0.3;
  const colors = ['#2a8a3a', '#8a2a2a', '#c08020', '#5a2a8a', '#20708a', '#a04080', '#3a6a20'];
  let ci = 0;
  for (const y of [1.55, 2.3, 3.05]) {
    group.add(mesh(G.box(10.6, 0.07, 0.45), mat('#3a2416', { map: wood() }), [0, y, shelfZ]));
    for (let x = -5; x <= 5; x += 0.38 + ((ci * 7) % 5) * 0.04) {
      if (((ci * 13) % 11) === 3) { ci++; continue; } // un trou ici et là
      const b = bottle(colors[ci % colors.length], 0.36 + ((ci * 5) % 4) * 0.04);
      b.position.set(x, y + 0.035, shelfZ + 0.02);
      group.add(b);
      ci++;
    }
  }
  // les vraies bouteilles des persos (rhum de Tices, Ricard de Lolobiscotto) en vedette sur le comptoir
  const shared = []; // les modèles des accessoires partagent géométries et matériaux avec le combat : jamais libérés ici
  const star = (name, x, size) => {
    if (!hasProp(name)) return;
    const prim = mesh(G.box(size * 0.35, size, size * 0.35), basic('#ffffff'));
    const p = fitProp(name, prim);
    p.position.set(x, COUNTER.h + 0.03 + size / 2, COUNTER.z - 0.25);
    group.add(p);
    shared.push(p);
  };
  star('rum', -4.6, 0.42); star('ricard', 4.0, 0.42);
  // un miroir sombre et l'enseigne au néon
  group.add(mesh(G.box(5.4, 0.5, 0.05), mat('#120a14'), [0, 3.95, ROOM.z0 + 0.06]));
  const signMat = new THREE.MeshBasicMaterial({ map: signTex('Le Dernier Verre', '#9dff3a'), transparent: true, depthWrite: false });
  const sign = mesh(new THREE.PlaneGeometry(5.2, 1.3), signMat, [0, 3.95, ROOM.z0 + 0.1]);
  group.add(sign);
  const signGlow = glow('#7aff3a', 6, 0.18); signGlow.position.set(0, 3.95, ROOM.z0 + 0.4); signGlow.scale.set(7, 2.2, 1);
  group.add(signGlow);
  anim.push((dt, t) => { const f = Math.sin(t * 23) > 0.97 ? 0.45 : 1; signMat.opacity = f; signGlow.material.opacity = 0.18 * f; });

  // le barman
  const barman = barmanSkel();
  barman.position.set(2.6, 0, COUNTER.z - 0.85);
  group.add(barman);
  const bm = barman.userData;
  anim.push((dt, t) => {
    // il essuie son verre, tourne la tête vers la salle, ses yeux clignotent
    const s = Math.sin(t * 5);
    bm.armL.rotation.set(-0.9, 0, 0.35); bm.armL.userData.fore.rotation.set(-0.9, 0, 0.4);
    bm.armR.rotation.set(-0.8 + s * 0.12, 0, -0.35 + s * 0.15); bm.armR.userData.fore.rotation.set(-1.0, 0, -0.5 + s * 0.3);
    bm.head.rotation.set(Math.sin(t * 0.7) * 0.08, (barman.userData.look ?? Math.sin(t * 0.35) * 0.5), Math.sin(t * 1.1) * 0.05);
    const blink = (t % 4.3) < 0.12 ? 0.02 : 1;
    bm.eyeL.scale.setScalar(0.16 * blink); bm.eyeR.scale.setScalar(0.16 * blink);
  });

  // deux lustres de bougies au-dessus du comptoir, de part et d'autre de l'enseigne (assez bas pour ne jamais la cacher)
  const chandCandles = [], chands = [], chandLights = [];
  for (const cx of [-3.9, 3.9]) {
    const chand = new THREE.Group();
    chand.position.set(cx, 3.25, -3.9);
    chand.add(mesh(new THREE.TorusGeometry(0.85, 0.05, 6, 24), mat('#2a2228', { metalness: 0.6 }), [0, 0, 0], [Math.PI / 2, 0, 0]));
    chand.add(mesh(G.cyl(0.03, 0.03, 4, 5), mat('#2a2228'), [0, 2, 0]));
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const ch = mesh(G.cyl(0.015, 0.015, 1.3, 4), mat('#2a2228'), [Math.cos(a) * 0.42, 0.58, Math.sin(a) * 0.42]); ch.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); chand.add(ch); }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const c = candle(0.22); c.position.set(Math.cos(a) * 0.85, 0.03, Math.sin(a) * 0.85); chand.add(c); chandCandles.push(c); }
    group.add(chand);
    chands.push(chand);
    const l = new THREE.PointLight('#ffb060', 30, 14, 1.6);
    l.position.set(cx, 3.0, -3.4);
    group.add(l);
    chandLights.push(l);
  }
  anim.push((dt, t) => chands.forEach((c, i) => { c.rotation.y = Math.sin(t * 0.4 + i) * 0.05; c.rotation.z = Math.sin(t * 0.55 + i * 2) * 0.02; }));

  // tables, tabourets
  const tableLights = [];
  for (const [x, z] of TABLES) {
    const tb = table();
    tb.position.set(x, 0, z);
    tb.rotation.y = x * 0.7;
    group.add(tb);
    const p = new THREE.PointLight('#ff9a40', 9, 6, 1.8);
    p.position.set(x, 1.6, z);
    group.add(p);
    tableLights.push(p);
  }
  for (const x of STOOLS) { const s = stool(); s.position.set(x, 0, COUNTER.z + COUNTER.d / 2 + 0.45); s.rotation.y = x; group.add(s); }

  // les fûts dans les coins du fond, la piste de danse et le juke-box à droite, les fléchettes à gauche
  for (const [x, z, y] of [[-8.6, -5.6, 0], [-9.6, -5.5, 0], [-9.1, -5.55, 1.0], [9.7, -5.6, 0]]) { const k = keg(); k.position.set(x, y, z); k.rotation.z = y ? Math.PI / 2 : 0; if (y) k.position.y = 1.05 + 0.42; group.add(k); }
  const tiles = [];
  for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) {
    const m = new THREE.MeshBasicMaterial({ color: (i + j) % 2 ? '#3a1050' : '#103a40', transparent: true, opacity: 0.85 });
    const tl = mesh(new THREE.PlaneGeometry(0.62, 0.62), m, [DANCE.x + i * 0.64, 0.012, DANCE.z + j * 0.64], [-Math.PI / 2, 0, 0]);
    group.add(tl);
    tiles.push({ m, i, j });
  }
  const juke = new THREE.Group();
  juke.add(mesh(G.box(1.0, 1.5, 0.6), mat('#5a1830', { roughness: 0.5 }), [0, 0.75, 0]));
  juke.add(mesh(G.cyl(0.5, 0.5, 0.6, 16, 1), mat('#5a1830', { roughness: 0.5 }), [0, 1.5, 0], [Math.PI / 2, 0, 0]));
  const jukeGlass = new THREE.MeshBasicMaterial({ color: '#ff60c0' });
  juke.add(mesh(G.box(0.7, 0.5, 0.05), jukeGlass, [0, 1.25, 0.31]));
  juke.add(mesh(G.box(0.8, 0.08, 0.05), basic('#ffd040'), [0, 0.6, 0.31]));
  juke.position.set(10.3, 0, -3.4);
  juke.rotation.y = -Math.PI / 2;
  group.add(juke);
  const jukeLight = new THREE.PointLight('#ff40c0', 14, 7, 1.8);
  jukeLight.position.set(9.2, 1.6, -3.3);
  group.add(jukeLight);
  const notes = [];
  for (let i = 0; i < 4; i++) {
    const n = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTex(), color: ['#ff80d0', '#80ffe0', '#ffe080'][i % 3], transparent: true, depthWrite: false }));
    n.scale.setScalar(0.35);
    group.add(n);
    notes.push({ n, ph: i / 4 });
  }
  anim.push((dt, t) => {
    const beat = Math.floor(t * 2.1);
    for (const T of tiles) T.m.color.set(((T.i + T.j + beat) & 3) === 0 ? '#c040ff' : ((T.i * 3 + T.j + beat) % 3 === 0 ? '#20c0b0' : '#22102e'));
    jukeGlass.color.setHSL((t * 0.15) % 1, 0.9, 0.6);
    jukeLight.color.setHSL((t * 0.15) % 1, 0.9, 0.55);
    for (const N of notes) {
      const k = (t * 0.35 + N.ph) % 1;
      N.n.position.set(9.9 - k * 0.8, 1.9 + k * 1.6, -3.4 + Math.sin(k * 9 + N.ph * 6) * 0.3);
      N.n.material.opacity = Math.sin(k * Math.PI);
    }
  });
  // la cible de fléchettes sur le mur de gauche
  const board = new THREE.Group();
  const rings = ['#101010', '#e8e0c8', '#c02020', '#e8e0c8', '#208040', '#c02020'];
  rings.forEach((c, i) => board.add(mesh(G.cyl(0.45 - i * 0.075, 0.45 - i * 0.075, 0.04 + i * 0.004, 20), mat(c), [0, i * 0.004, 0])));
  for (let i = 0; i < 3; i++) board.add(mesh(G.cyl(0.008, 0.008, 0.25, 4), mat('#c0c0c0', { metalness: 0.8 }), [0.1 * (i - 1), 0.15, 0.07 * i], [0.3, 0, 0]));
  board.rotation.z = -Math.PI / 2;
  board.position.set(ROOM.x0 + 0.04, 1.9, -3.4);
  group.add(board);

  // la porte de sortie (mur de gauche) et son panneau qui luit
  const door = new THREE.Group();
  door.add(mesh(G.box(0.25, 2.9, DOOR.w + 0.5), beam, [0, 1.45, 0]));
  const leaf = mesh(G.box(0.12, 2.6, DOOR.w), mat('#3a2014', { map: repeated(wood(), 1, 3) }), [0.12, 1.3, 0]);
  door.add(leaf);
  door.add(mesh(G.ball(0.07, 1), brass, [0.22, 1.25, DOOR.w * 0.35]));
  const exitMat = new THREE.MeshBasicMaterial({ map: signTex('SORTIE', '#ff5a3a', 256, 96, 64), transparent: true, depthWrite: false });
  const exit = mesh(new THREE.PlaneGeometry(1.3, 0.48), exitMat, [0.2, 3.15, 0], [0, Math.PI / 2, 0]);
  door.add(exit);
  const exitGlow = glow('#ff5a3a', 2, 0.3); exitGlow.position.set(0.5, 3.15, 0);
  door.add(exitGlow);
  door.position.set(ROOM.x0, 0, DOOR.z);
  group.add(door);
  anim.push((dt, t) => { exitGlow.material.opacity = 0.22 + Math.sin(t * 3) * 0.08; });

  // un cercueil-banquette devant à gauche, une citrouille géante devant à droite, d'autres dans les coins
  const cof = coffin(); cof.position.set(-7.4, 0, 5.2); cof.rotation.y = 1.2; group.add(cof);
  const pumpkins = [];
  for (const [x, z, r] of [[8.2, 5.1, 0.55], [-10.2, -1.4, 0.35], [10.2, 1.4, 0.4], [-5.6, -5.7, 0.3], [6.2, -5.75, 0.32]]) { const p = pumpkin(r); p.position.set(x, 0, z); p.rotation.y = -x * 0.08; group.add(p); pumpkins.push(p); }

  // des toiles d'araignée dans les coins et sous les étagères
  const webM = new THREE.MeshBasicMaterial({ map: webTex(), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.55 });
  const web = (x, y, z, ry, s, flip) => { const m = mesh(new THREE.PlaneGeometry(s, s), webM, [x, y, z], [0, ry, 0]); if (flip) m.scale.x = -1; group.add(m); };
  web(ROOM.x0 + 1.2, H - 1.2, ROOM.z0 + 0.05, 0, 2.4, false);
  web(ROOM.x1 - 1.2, H - 1.2, ROOM.z0 + 0.05, 0, 2.4, true);
  web(-4.4, 2.75, shelfZ + 0.24, 0, 0.9, false);
  web(4.6, 2.0, shelfZ + 0.24, 0, 0.8, true);
  web(ROOM.x0 + 0.05, H - 1.3, -4.8, Math.PI / 2, 2.6, true);
  web(ROOM.x1 - 0.05, H - 1.3, -4.8, -Math.PI / 2, 2.6, false);
  web(ROOM.x0 + 0.06, 3.9, DOOR.z + 1.5, Math.PI / 2, 1.4, false); // au-dessus de la porte
  // une araignée qui monte et descend au bout de son fil
  const spider = new THREE.Group();
  spider.add(mesh(G.ball(0.08, 1), basic('#120a14'), [0, 0, 0]));
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) spider.add(mesh(G.cyl(0.008, 0.008, 0.16, 3), basic('#120a14'), [sx * 0.08, -0.02, (i - 1.5) * 0.04], [0, 0, sx * 1.1]));
  const thread = mesh(G.cyl(0.004, 0.004, 1, 3), basic('#d8d8e0', { transparent: true, opacity: 0.5 }), [0, 0.5, 0]);
  const spiderG = new THREE.Group(); spiderG.add(thread, spider);
  spiderG.position.set(-5.6, 3.5, -2.0);
  group.add(spiderG);
  anim.push((dt, t) => { const d = 0.6 + (Math.sin(t * 0.5) * 0.5 + 0.5) * 1.6; spider.position.y = -d; thread.scale.y = d; thread.position.y = -d / 2; spider.rotation.y = Math.sin(t * 2) * 0.4; });

  // des chauves-souris sous le plafond (le décor des arènes, à l'échelle du bar)
  const batG = new THREE.Group();
  batG.scale.setScalar(0.28);
  batG.position.set(0, 2.6, -2);
  group.add(batG);
  const bats = new Bats(batG, 4);
  // la poussière qui flotte dans la lumière
  const dustM = new THREE.SpriteMaterial({ map: glowTex(), color: '#ffd8a0', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
  const dust = [];
  for (let i = 0; i < 26; i++) { const s = new THREE.Sprite(dustM); s.scale.setScalar(0.06 + (i % 3) * 0.03); group.add(s); dust.push({ s, x: -9 + ((i * 37) % 18), y: 0.8 + ((i * 13) % 30) / 10, z: -5 + ((i * 23) % 10), ph: i }); }

  // ---- Halloween, comme les maisons décorées des vieux films : guirlandes d'ampoules, citrouilles, chauves-souris en
  // papier, un fantôme en drap, des fanions. Rien qu'en code et à bas coût : aucune vraie lumière (pas de recompilation de
  // shaders), toutes les ampoules dans un seul THREE.Points (une seule passe de dessin), le scintillement par leurs couleurs
  halloween(group, anim, pumpkins, web);

  const candles = [...counterCandles, ...chandCandles];
  group.traverse((o) => { if (o.userData && o.userData.candle) candles.push(o.userData.candle); });
  const lightsF = [...chandLights.map((l) => [l, 30]), ...tableLights.map((l) => [l, 9])];

  function update(dt, t) {
    for (const f of anim) f(dt, t);
    for (const c of candles) {
      const u = c.userData, k = 0.85 + 0.15 * Math.sin(t * 13 + u.ph) * Math.sin(t * 7.3 + u.ph * 2);
      u.flame.scale.set(1, k * 1.15, 1); u.halo.material.opacity = 0.75 * k;
    }
    lightsF.forEach(([l, b], i) => { l.intensity = b * (0.85 + 0.15 * Math.sin(t * 11 + i * 2.1) * Math.sin(t * 6.1 + i)); });
    for (const p of pumpkins) {
      const L = p.userData.lit, f = 0.82 + 0.18 * Math.sin(t * 9 + L.ph) * Math.sin(t * 5.3 + L.ph * 1.7);
      p.userData.halo.material.opacity = 0.5 * f;
      L.m.emissiveIntensity = 0.45 + 0.35 * f;
      L.face.color.setRGB(1, 0.62 + 0.25 * f, 0.18 + 0.12 * f);
    }
    bats.update(t);
    for (const d of dust) d.s.position.set(d.x + Math.sin(t * 0.2 + d.ph) * 0.6, d.y + Math.sin(t * 0.3 + d.ph * 2) * 0.3, d.z + Math.cos(t * 0.17 + d.ph) * 0.5);
  }

  // ce qui bloque les déplacements : boîtes [x0, z0, x1, z1] et cercles [x, z, r]
  const blockers = {
    boxes: [[COUNTER.x0 - 0.2, COUNTER.z - COUNTER.d / 2 - 2, COUNTER.x1 + 0.2, COUNTER.z + COUNTER.d / 2 + 0.15],
      [-10.2, ROOM.z0, -8.1, -5.0], [9.2, ROOM.z0, ROOM.x1, -5.1], [9.75, -3.95, ROOM.x1, -2.85]],
    circles: [...TABLES.map(([x, z]) => [x, z, 0.78]), ...STOOLS.map((x) => [x, COUNTER.z + COUNTER.d / 2 + 0.45, 0.3]),
      [-7.4, 5.2, 0.75], [8.2, 5.1, 0.6], [-10.2, -1.4, 0.4], [10.2, 1.4, 0.45]],
  };

  const own = clones; clones = [];
  function dispose() {
    for (const o of shared) o.parent && o.parent.remove(o);
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) m.dispose();
    });
    signMat.map.dispose(); exitMat.map.dispose();
    for (const t of own) t.dispose();
  }

  return { group, update, blockers, spots: SPOTS, door: DOOR, counter: COUNTER, barman, dispose, fog: ['#120c18', 12, 34], bg: '#0a0710' };
}

// ---- les décorations d'Halloween du bar -----------------------------------------------------------------------------
const BULB = ['#ff9a2a', '#b45cff', '#6aff5a', '#ffe0a0', '#ff9a2a', '#ffe0a0']; // orange, violet, vert, blanc chaud
function halloween(group, anim, pumpkins, web) {
  // des guirlandes en festons : [début, fin, nombre de festons, creux (m)]
  const W = ROOM.x1, Z0 = ROOM.z0;
  const runs = [
    [[-W + 0.3, 5.75, Z0 + 0.2], [W - 0.3, 5.75, Z0 + 0.2], 5, 0.55], // le mur du fond, tout en haut
    [[-5.3, 3.45, Z0 + 0.45], [5.3, 3.45, Z0 + 0.45], 4, 0.18], // au-dessus des étagères
    [[COUNTER.x0, 1.06, COUNTER.z + COUNTER.d / 2 + 0.17], [COUNTER.x1, 1.06, COUNTER.z + COUNTER.d / 2 + 0.17], 8, 0.12], // le long du comptoir
    [[-W + 0.15, 5.5, Z0 + 0.3], [-W + 0.15, 5.5, ROOM.z1 + 1.5], 6, 0.45], [[W - 0.15, 5.5, Z0 + 0.3], [W - 0.15, 5.5, ROOM.z1 + 1.5], 6, 0.45], // les murs
    [[-W + 0.2, 5.9, -1.2], [W - 0.2, 5.9, -1.2], 4, 0.75], [[-W + 0.2, 6.0, 3.0], [W - 0.2, 6.0, 3.0], 4, 0.8], // en travers de la salle
    // autour de la porte
    [[ROOM.x0 + 0.12, 0.3, DOOR.z - 1.0], [ROOM.x0 + 0.12, 3.0, DOOR.z - 1.0], 1, 0], [[ROOM.x0 + 0.12, 3.0, DOOR.z - 1.0], [ROOM.x0 + 0.12, 3.0, DOOR.z + 1.0], 1, 0.1],
    [[ROOM.x0 + 0.12, 3.0, DOOR.z + 1.0], [ROOM.x0 + 0.12, 0.3, DOOR.z + 1.0], 1, 0],
  ];
  const bulbs = [], wire = [];
  const at = (a, b, sag, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - sag * 4 * (u * (1 - u)), a[2] + (b[2] - a[2]) * u];
  for (const [a, b, n, sag] of runs) {
    for (let k = 0; k < n; k++) {
      const pa = at(a, b, 0, k / n), pb = at(a, b, 0, (k + 1) / n);
      const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]);
      const nb = Math.max(2, Math.round(len / 0.42));
      let prev = pa;
      for (let i = 1; i <= 16; i++) { const q = at(pa, pb, sag, i / 16); wire.push(...prev, ...q); prev = q; }
      for (let i = 0; i < nb; i++) { const q = at(pa, pb, sag, (i + 0.5) / nb); bulbs.push([q[0], q[1] - 0.05, q[2]]); }
    }
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  group.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#1a120c' })));
  const pos = new Float32Array(bulbs.length * 3), col = new Float32Array(bulbs.length * 3), base = [], ph = [];
  const c = new THREE.Color();
  bulbs.forEach((q, i) => {
    pos.set(q, i * 3);
    c.set(BULB[(i * 7 + (i >> 2)) % BULB.length]);
    base.push(c.r, c.g, c.b); ph.push(Math.random() * 20, 0.6 + Math.random() * 1.4);
  });
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  bg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(bg, new THREE.PointsMaterial({ size: 0.62, map: glowTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  pts.frustumCulled = false;
  group.add(pts);
  // la lueur chaude autour des guirlandes (les mêmes points, en grand et très pâle)
  const halo = new THREE.Points(bg, new THREE.PointsMaterial({ size: 1.9, map: glowTex(), vertexColors: true, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  halo.frustumCulled = false;
  group.add(halo);
  // le petit culot coloré de chaque ampoule (la lueur ci-dessus fait le halo)
  const cores = new THREE.Points(bg, new THREE.PointsMaterial({ size: 0.1, vertexColors: true, sizeAttenuation: true, toneMapped: false }));
  cores.frustumCulled = false;
  group.add(cores);
  anim.push((dt, t) => {
    // elles scintillent doucement, chacune à son rythme ; de temps en temps une ampoule baisse, puis revient
    for (let i = 0; i < bulbs.length; i++) {
      const p = ph[i * 2], sp = ph[i * 2 + 1];
      let k = 0.78 + 0.22 * Math.sin(t * sp + p);
      if (Math.sin(t * 0.37 + p * 3.1) > 0.985) k *= 0.35;
      col[i * 3] = base[i * 3] * k; col[i * 3 + 1] = base[i * 3 + 1] * k; col[i * 3 + 2] = base[i * 3 + 2] * k;
    }
    bg.attributes.color.needsUpdate = true;
  });

  // des citrouilles en plus, allumées de l'intérieur : aux deux bouts du comptoir, une pile à la porte, sur les étagères
  for (const [x, y, z, r, ry] of [[COUNTER.x0 + 0.25, COUNTER.h + 0.03, COUNTER.z + 0.1, 0.22, 0.3], [COUNTER.x1 - 0.25, COUNTER.h + 0.03, COUNTER.z + 0.1, 0.24, -0.3],
    [ROOM.x0 + 0.6, 0, DOOR.z - 1.45, 0.38, 1.2], [ROOM.x0 + 0.6, 0.62, DOOR.z - 1.45, 0.22, 1.5], [ROOM.x0 + 0.6, 0, DOOR.z + 1.45, 0.32, 1.9],
    [-3.6, 3.08, Z0 + 0.32, 0.17, 0], [3.2, 2.33, Z0 + 0.32, 0.16, 0], [9.6, 0, 4.4, 0.3, -0.9]]) {
    const p = pumpkin(r); p.position.set(x, y, z); p.rotation.y = ry; group.add(p); pumpkins.push(p);
  }

  // des chauves-souris en papier noir, pendues à un fil sous le plafond, qui tournent doucement
  const bc = document.createElement('canvas'); bc.width = 128; bc.height = 64;
  const g2 = bc.getContext('2d'); g2.fillStyle = '#fff';
  g2.beginPath(); g2.moveTo(64, 20); g2.quadraticCurveTo(40, 2, 4, 14); g2.quadraticCurveTo(14, 30, 8, 46); g2.quadraticCurveTo(22, 36, 30, 52); g2.quadraticCurveTo(42, 38, 56, 54);
  g2.lineTo(64, 44); g2.lineTo(72, 54); g2.quadraticCurveTo(86, 38, 98, 52); g2.quadraticCurveTo(106, 36, 120, 46); g2.quadraticCurveTo(114, 30, 124, 14); g2.quadraticCurveTo(88, 2, 64, 20); g2.fill();
  g2.beginPath(); g2.arc(64, 26, 9, 0, 7); g2.fill(); g2.beginPath(); g2.moveTo(57, 20); g2.lineTo(58, 8); g2.lineTo(62, 18); g2.moveTo(71, 20); g2.lineTo(70, 8); g2.lineTo(66, 18); g2.fill();
  const bt = new THREE.CanvasTexture(bc);
  const bm = new THREE.MeshBasicMaterial({ color: '#140c18', map: bt, alphaTest: 0.5, side: THREE.DoubleSide });
  const bgeo = new THREE.PlaneGeometry(0.62, 0.31);
  const strings = [], paper = [];
  for (const [x, y, z, len] of [[-8.6, 6.1, -3.5, 1.0], [-6.0, 6.1, 0.8, 1.4], [-2.4, 6.1, -2.2, 0.8], [1.2, 6.1, 1.4, 1.2], [4.6, 6.1, -2.4, 1.0], [7.4, 6.1, 1.6, 1.5], [9.3, 6.1, -1.0, 0.9], [-9.4, 6.1, 2.2, 1.1], [0, 6.1, -5.2, 0.7]]) {
    const b = new THREE.Mesh(bgeo, bm);
    b.position.set(x, y - len, z);
    group.add(b);
    strings.push(x, y, z, x, y - len + 0.05, z);
    paper.push({ b, ph: Math.random() * 6, len });
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(strings, 3));
  group.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: '#5a5060', transparent: true, opacity: 0.5 })));
  anim.push((dt, t) => { for (const P of paper) { P.b.rotation.y = Math.sin(t * 0.6 + P.ph) * 1.4; P.b.rotation.z = Math.sin(t * 1.1 + P.ph) * 0.12; } });

  // un fantôme en drap, qui flotte au-dessus de la piste de danse (un drap blanc, deux trous noirs)
  const prof = [[0, 0.95], [0.12, 0.94], [0.22, 0.88], [0.28, 0.76], [0.31, 0.6], [0.34, 0.42], [0.4, 0.22], [0.5, 0.04], [0.56, 0]].map(([r, y]) => new THREE.Vector2(r, y));
  const sheet = new THREE.LatheGeometry(prof, 28);
  const sp = sheet.attributes.position;
  for (let i = 0; i < sp.count; i++) { // l'ourlet ondule
    const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i);
    if (y < 0.3) { const a = Math.atan2(z, x), w = (0.3 - y) / 0.3; sp.setY(i, y + Math.sin(a * 7) * 0.06 * w); sp.setX(i, x * (1 + Math.sin(a * 3) * 0.08 * w)); }
  }
  sheet.computeVertexNormals();
  const ghost = new THREE.Group();
  const gm = new THREE.MeshStandardMaterial({ color: '#f4f2ff', emissive: '#8a90c0', emissiveIntensity: 0.55, roughness: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.93 });
  const body = new THREE.Mesh(sheet, gm); body.scale.setScalar(1.25); ghost.add(body);
  const eye = basic('#0a0610');
  ghost.add(mesh(G.ball(0.05, 1), eye, [-0.09, 0.96, 0.33], null, [1, 1.4, 0.4]), mesh(G.ball(0.05, 1), eye, [0.09, 0.96, 0.33], null, [1, 1.4, 0.4]), mesh(G.ball(0.045, 1), eye, [0, 0.82, 0.36], null, [1, 1.2, 0.4]));
  const gh = glow('#c8d0ff', 2.2, 0.16); gh.position.y = 0.6; ghost.add(gh);
  ghost.position.set(8.0, 2.5, -1.9);
  group.add(ghost);
  anim.push((dt, t) => {
    ghost.position.y = 2.5 + Math.sin(t * 1.1) * 0.18;
    ghost.position.x = 8.0 + Math.sin(t * 0.37) * 0.5;
    ghost.rotation.y = -0.5 + Math.sin(t * 0.5) * 0.35; ghost.rotation.z = Math.sin(t * 0.9) * 0.06;
    gh.material.opacity = 0.13 + 0.05 * Math.sin(t * 2.3);
  });

  // des fanions en papier (orange, noir, violet) en festons sur les murs du côté : une seule géométrie, des couleurs par sommet
  const fp = [], fc = [], cc = new THREE.Color();
  const flags = [[[-W + 0.2, 4.85, -5.8], [-W + 0.2, 4.85, 5.5], 4, 0.35], [[W - 0.2, 4.85, -5.8], [W - 0.2, 4.85, 5.5], 4, 0.35], [[-5.6, 4.95, Z0 + 0.25], [5.6, 4.95, Z0 + 0.25], 3, 0.18]];
  let fi = 0;
  for (const [a, b, n, sag] of flags) {
    for (let k = 0; k < n; k++) {
      const pa = at(a, b, 0, k / n), pb = at(a, b, 0, (k + 1) / n);
      for (let i = 0; i < 9; i++) {
        const q0 = at(pa, pb, sag, i / 9), q1 = at(pa, pb, sag, (i + 0.8) / 9);
        const tip = [(q0[0] + q1[0]) / 2, (q0[1] + q1[1]) / 2 - 0.26, (q0[2] + q1[2]) / 2];
        fp.push(...q0, ...q1, ...tip);
        cc.set(['#e8741c', '#1a1018', '#7a3ab0'][fi++ % 3]);
        for (let v = 0; v < 3; v++) fc.push(cc.r, cc.g, cc.b);
      }
    }
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
  fg.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3));
  fg.computeVertexNormals();
  group.add(new THREE.Mesh(fg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));

  // des fausses toiles en plus (le coton étiré des décorations) : aux coins du comptoir, sur la porte, au fantôme
  web(COUNTER.x0 + 0.35, COUNTER.h + 0.4, COUNTER.z + COUNTER.d / 2 + 0.18, 0, 0.7, false);
  web(COUNTER.x1 - 0.35, COUNTER.h + 0.4, COUNTER.z + COUNTER.d / 2 + 0.18, 0, 0.7, true);
  web(ROOM.x0 + 0.08, 2.65, DOOR.z - 0.75, Math.PI / 2, 0.8, true);
}

function noteTex() {
  if (noteTex.t) return noteTex.t;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.beginPath(); g.ellipse(22, 46, 11, 8, -0.4, 0, Math.PI * 2); g.fill();
  g.fillRect(30, 10, 5, 38);
  g.beginPath(); g.moveTo(35, 10); g.quadraticCurveTo(52, 16, 48, 32); g.quadraticCurveTo(46, 22, 35, 22); g.fill();
  noteTex.t = new THREE.CanvasTexture(c);
  return noteTex.t;
}
