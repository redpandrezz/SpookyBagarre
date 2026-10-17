// Instanced particles: blood (mist, drops and gobs that stain the ground), gore chunks, sparks, dust, cheese flakes, money...
import * as THREE from 'three';
import { heartGeo } from './friendsView.js';
import { STYLE } from './style.js';
import { puffTex } from './materials.js';
import { HitSprites } from './hitSprites.js';
import { Smoke } from './smoke.js';

const dummy = new THREE.Object3D();

// a lump of flesh: a knobbly ball, a little flattened
function meatGeo() {
  const g = new THREE.IcosahedronGeometry(0.1, 1);
  const p = g.attributes.position, seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = p.getX(i).toFixed(4) + p.getY(i).toFixed(4) + p.getZ(i).toFixed(4);
    if (!seen.has(key)) seen.set(key, 0.75 + Math.random() * 0.5);
    const k = seen.get(key);
    p.setXYZ(i, p.getX(i) * k * 1.25, p.getY(i) * k * 0.85, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}
const col = new THREE.Color();

class Pool {
  constructor(scene, geo, material, max, opts = {}) {
    this.mesh = new THREE.InstancedMesh(geo, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.max = max;
    this.p = [];
    this.opts = opts;
  }
  add(o) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push(o);
  }
}

export class Particles {
  constructor(scene) {
    this.scene = scene;
    const lam = (o = {}) => new THREE.MeshLambertMaterial({ color: '#ffffff', ...o });
    const add = (o = {}) => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, ...o });
    this.pools = {
      blood: STYLE.smooth
        ? new Pool(scene, new THREE.IcosahedronGeometry(0.06, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.1, metalness: 0, emissive: '#2a0000' }), 4000)
        : new Pool(scene, new THREE.TetrahedronGeometry(0.07, 0), lam({ emissive: '#300000' }), 4000),
      // lumps of flesh: knobbly, wet (gore)
      chunk: new Pool(scene, meatGeo(), STYLE.smooth ? new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0, emissive: '#1a0000' }) : lam({ emissive: '#200000' }), 600),
      bone: new Pool(scene, new THREE.CylinderGeometry(0.035, 0.035, 0.3, 5), lam(), 120),
      spark: new Pool(scene, new THREE.OctahedronGeometry(0.09, 0), add(), 900),
      dust: STYLE.smooth
        ? new Pool(scene, new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: puffTex(), color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false }), 500, { billboard: true })
        : new Pool(scene, new THREE.IcosahedronGeometry(0.22, 0), lam({ transparent: true, opacity: 0.7, depthWrite: false }), 500),
      flake: new Pool(scene, new THREE.BoxGeometry(0.1, 0.02, 0.06), lam(), 800),
      bill: new Pool(scene, new THREE.PlaneGeometry(0.28, 0.14), lam({ side: THREE.DoubleSide }), 500),
      // liquid drops: glossy, a little see-through, stretched along their flight (a falling drop, not a ball)
      drop: new Pool(scene, new THREE.IcosahedronGeometry(0.05, STYLE.smooth ? 2 : 0), STYLE.smooth ? new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.06, metalness: 0, emissive: '#202024', transparent: true, opacity: 0.88 }) : lam({ emissive: '#111' }), 1200),
      // impact shards: little 3D spikes that fly out of a blow along its launch, stretched along their flight (hitShards)
      shard: new Pool(scene, new THREE.ConeGeometry(0.05, 0.42, 4).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 160),
      ring: new Pool(scene, new THREE.TorusGeometry(0.5, 0.06, 4, 16), add({ side: THREE.DoubleSide }), 80),
      heart: new Pool(scene, heartGeo(0.32, 0.12), add(), 240, { billboard: true }),
    };
    this.hit = new HitSprites(scene); // impact flashes (sprites)
    this.smoke = new Smoke(scene);    // cartoon puffs from the feet (dashes, skids, jumps, landings)
    this.onGround = null; // callback(x, y, z, kind, size)
    this.stage = null;
  }

  // ---- emitters ----------------------------------------------------------------------------------------------
  // blood, a liquid: a fine mist (fast, gone in a blink, no stain), drops (most of it) and a few heavy gobs (slower,
  // bigger stains); fresh and glossy, bright arterial red or darker, stretched along their flight (update)
  blood(x, y, z, dir, n, power = 1) {
    const P = this.pools.blood;
    for (let i = 0; i < n; i++) {
      const q = Math.random(), kind = q < 0.28 ? 0 : q < 0.88 ? 1 : 2;
      const sp = (kind === 0 ? 3 + Math.random() * 10 : kind === 1 ? 2 + Math.random() * 9 : 2 + Math.random() * 5) * power;
      const dx = (dir ? dir[0] : 0) * sp * 0.8 + (Math.random() - 0.5) * sp;
      const dz = (dir ? dir[2] : 0) * sp * 0.8 + (Math.random() - 0.5) * sp;
      const dy = (dir ? Math.max(0, dir[1]) : 0) * sp * 0.6 + Math.random() * sp * 0.7 + 1;
      const shade = Math.random() < 0.3 ? 0.3 + Math.random() * 0.2 : 0.6 + Math.random() * 0.4;
      const s = kind === 0 ? 0.28 + Math.random() * 0.25 : kind === 1 ? 0.6 + Math.random() * 0.9 : 1.3 + Math.random() * 0.7;
      P.add({ x, y, z, vx: dx, vy: dy, vz: dz, life: kind === 0 ? 0.3 + Math.random() * 0.3 : 2.5 + Math.random(), s, r: [0.85 * shade + 0.06, 0.012 * shade, 0.025 * shade],
        rot: Math.random() * 6, spin: (Math.random() - 0.5) * 20, g: kind === 0 ? 12 : 22, drag: kind === 0 ? 2.5 : 0, kind: 'blood', stick: kind > 0, shrink: kind === 0, gob: kind === 2 });
    }
  }

  gore(x, y, z, v, n = 14) {
    const C = this.pools.chunk, B = this.pools.bone;
    for (let i = 0; i < n; i++) {
      const sp = 6 + Math.random() * 14;
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2;
      const vx = Math.cos(a) * Math.cos(e) * sp + (v ? v[0] * 0.3 : 0), vz = Math.sin(a) * Math.cos(e) * sp + (v ? v[2] * 0.3 : 0), vy = Math.sin(e) * sp + 4;
      const q = Math.random();
      const r = q < 0.55 ? [0.4 + Math.random() * 0.25, 0.02, 0.03] : q < 0.88 ? [0.85, 0.35 + Math.random() * 0.15, 0.36] : [0.92, 0.8, 0.6];
      C.add({ x, y, z, vx, vy, vz, life: 7 + Math.random() * 3, s: 0.6 + Math.random() * 1.4, r, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 18, g: 26, kind: 'chunk', stick: true, bounce: 0.3, trail: true });
      if (i % 3 === 0) B.add({ x, y, z, vx: vx * 0.8, vy: vy * 1.1, vz: vz * 0.8, life: 6, s: 0.7 + Math.random() * 0.6, r: [0.95, 0.93, 0.85], rot: Math.random() * 6, spin: (Math.random() - 0.5) * 25, g: 26, kind: 'bone', bounce: 0.4, trail: true });
    }
    this.blood(x, y, z, v ? [v[0] * 0.05, 0.5, v[2] * 0.05] : null, 120 + n * 5, 1.6);
  }

  sparks(x, y, z, n, color = '#fff2a8', speed = 9, life = 0.35) {
    const P = this.pools.spark;
    col.set(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * 2;
      const sp = speed * (0.4 + Math.random());
      P.add({ x, y, z, vx: Math.cos(a) * sp, vy: e * sp * 0.5, vz: Math.sin(a) * sp, life: life * (0.6 + Math.random() * 0.8), s: 1 + Math.random(), r: [col.r, col.g, col.b], rot: 0, spin: 10, g: 0, drag: 6, kind: 'spark', shrink: true });
    }
  }

  // a sheaf of spikes at the point of impact, thrown mostly along the launch (dir) and a little everywhere; the colour of
  // the attacker with a white-hot one among them; gone in about a third of a second (shrinking along their flight)
  shards(x, y, z, dir, n, color = '#ffd080', power = 1) {
    const P = this.pools.shard;
    col.set(color);
    for (let i = 0; i < n; i++) {
      let rx = Math.random() * 2 - 1, ry = Math.random() * 2 - 1, rz = Math.random() * 2 - 1;
      const rl = Math.hypot(rx, ry, rz) || 1;
      const k = 0.75 + Math.random() * 0.6;
      let vx = (dir ? dir[0] : 0) * k + rx / rl * 0.75, vy = (dir ? dir[1] : 0) * k + ry / rl * 0.75 + 0.15, vz = (dir ? dir[2] : 0) * k * 0.6 + rz / rl * 0.75;
      const vl = Math.hypot(vx, vy, vz) || 1, sp = (8 + Math.random() * 11) * power;
      const white = Math.random() < 0.4, life = 0.26 + Math.random() * 0.24;
      P.add({ x, y, z, vx: vx / vl * sp, vy: vy / vl * sp, vz: vz / vl * sp, life, l0: life, s: 0.65 + Math.random() * 0.85,
        r: white ? [1, 1, 1] : [Math.min(1, col.r * 1.15 + 0.1), Math.min(1, col.g * 1.15 + 0.1), Math.min(1, col.b * 1.15 + 0.1)],
        rot: 0, spin: 0, g: 5, drag: 3.2, kind: 'shard' });
    }
  }

  // dust stays subtle: fewer, smaller, shorter puffs than asked (every caller goes through here)
  dust(x, y, z, n, color = '#b9b3a6', spread = 1) {
    const P = this.pools.dust;
    col.set(color);
    n = Math.max(1, Math.round(n * 0.45));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (0.8 + Math.random() * 2) * spread;
      P.add({ x: x + Math.cos(a) * 0.2, y: y + 0.1, z: z + Math.sin(a) * 0.2, vx: Math.cos(a) * sp, vy: 0.3 + Math.random() * 0.9, vz: Math.sin(a) * sp, life: 0.3 + Math.random() * 0.3, s: 0.35 + Math.random() * 0.4, r: [col.r, col.g, col.b], rot: 0, spin: 0, g: -0.5, drag: 3, kind: 'dust', grow: true, floor: y });
    }
  }

  burst(kind, x, y, z, n, color, opts = {}) {
    const P = this.pools[kind];
    col.set(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.4 - 0.2;
      const sp = (opts.speed || 6) * (0.3 + Math.random());
      P.add({ x, y, z, vx: Math.cos(a) * Math.cos(e) * sp + (opts.vx || 0), vy: Math.sin(e) * sp + (opts.vy || 0), vz: Math.sin(a) * Math.cos(e) * sp + (opts.vz || 0),
        life: (opts.life || 1.2) * (0.6 + Math.random() * 0.6), s: (opts.s || 1) * (0.6 + Math.random() * 0.8), r: [col.r * (0.85 + Math.random() * 0.3), col.g * (0.85 + Math.random() * 0.3), col.b * (0.85 + Math.random() * 0.3)],
        rot: Math.random() * 6, spin: (Math.random() - 0.5) * (opts.spin || 12), g: opts.g ?? 14, drag: opts.drag || 0, kind, flutter: opts.flutter, stick: opts.stick, shrink: opts.shrink, bounce: opts.bounce });
    }
  }

  // face: the ring faces the camera (a burst in the air: lying flat, seen edge-on, it would be a glowing bar)
  shockRing(x, y, z, color = '#ffffff', size = 1, life = 0.35, face = false) {
    col.set(color);
    this.pools.ring.add({ x, y, z, vx: 0, vy: 0, vz: 0, life, l0: life, s: 0.2, grow: size * 9, r: [col.r, col.g, col.b], rot: 0, spin: 0, g: 0, kind: 'ring', flat: !face, face });
  }

  // ---- update ------------------------------------------------------------------------------------------------
  update(dt) {
    this.hit.update(dt);
    this.smoke.update(dt);
    const st = this.stage;
    for (const name of Object.keys(this.pools)) {
      const P = this.pools[name];
      const arr = P.p;
      let w = 0;
      for (let i = 0; i < arr.length; i++) {
        const o = arr[i];
        o.life -= dt;
        if (o.life <= 0) continue;
        if (!o.landed) {
          const py = o.y;
          o.vy -= o.g * dt;
          if (o.drag) { const k = Math.exp(-o.drag * dt); o.vx *= k; o.vy *= o.g ? 1 : k; o.vz *= k; }
          if (o.flutter) { o.vx += Math.sin(o.life * 9 + o.rot) * 6 * dt; o.vz += Math.cos(o.life * 7 + o.rot) * 6 * dt; o.vy = Math.max(o.vy, -1.6); }
          o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
          o.rot += o.spin * dt;
          if (o.trail && (o.tt = (o.tt || 0) - dt) <= 0) { o.tt = 0.03; this.blood(o.x, o.y, o.z, [o.vx * 0.03, 0, o.vz * 0.03], 1, 0.25); }
          if (st && o.vy < 0 && (o.stick || o.bounce)) {
            const s = st.findLanding3(o.x, o.z, py, o.y);
            if (s) {
              const gy = st.heightAt(s, o.x, o.z);
              o.y = gy + 0.02;
              if (o.bounce && Math.abs(o.vy) > 3) { o.vy = -o.vy * o.bounce; o.vx *= 0.6; o.vz *= 0.6; if (this.onGround && o.kind === 'chunk') this.onGround(o.x, gy, o.z, 'chunk', o.s, s, o.vx, o.vz); }
              else {
                o.landed = true; o.surf = s.idx;
                if (this.onGround) this.onGround(o.x, gy, o.z, o.kind, o.s, s, o.vx, o.vz, o.gob);
                if (o.kind === 'blood') o.life = Math.min(o.life, 0.15);
                else o.life = Math.min(o.life, o.kind === 'chunk' || o.kind === 'bone' ? 6 : 2.5); // the lumps lie there a while
              }
            }
          }
          if (o.y < -30) o.life = 0;
        }
        arr[w++] = o;
      }
      arr.length = w;
      const mesh = P.mesh;
      let n = 0;
      for (const o of arr) {
        let s = o.s;
        if (o.shrink) s *= Math.max(0, o.life * 3);
        if (o.grow) s *= 1 + (1 - o.life) * 1.6;
        if (o.kind === 'ring') { s = o.s + (o.l0 - o.life) * o.grow; }
        dummy.position.set(o.x, o.y, o.z);
        if (P.opts.billboard && this.camera) {
          // soft puffs face the camera, rolling slowly, and shrink away at the end of their life
          dummy.quaternion.copy(this.camera.quaternion); dummy.rotateZ(o.rot);
          s *= Math.min(1, o.life / 0.25);
          // a flat puff must not cut into the floor (a hard straight edge)
          if (o.floor !== undefined) dummy.position.y = Math.max(o.y, o.floor + s * 0.62);
          dummy.scale.setScalar(s * 1.6);
        } else if ((o.kind === 'drop' || o.kind === 'blood') && !o.landed && STYLE.smooth) {
          // a falling drop, not a ball: stretched along its flight (blood a little more: it is thinner)
          const v = Math.hypot(o.vx, o.vy, o.vz), b = o.kind === 'blood';
          dummy.lookAt(o.x + o.vx, o.y + o.vy, o.z + o.vz);
          dummy.scale.set(s * (b ? 0.66 : 0.72), s * (b ? 0.66 : 0.72), s * (1 + Math.min(b ? 2.8 : 2.2, v * (b ? 0.11 : 0.09))));
        } else if (o.kind === 'shard') {
          // a spike pointing where it flies, melting to nothing at the end of its short life
          const v = Math.hypot(o.vx, o.vy, o.vz), k = Math.min(1, o.life / (o.l0 * 0.6));
          dummy.lookAt(o.x + o.vx, o.y + o.vy, o.z + o.vz);
          dummy.scale.set(s * 0.55 * k, s * 0.55 * k, s * (0.7 + v * 0.07) * k);
        } else if (o.kind === 'spark' && STYLE.smooth) {
          // sparks stretch along their velocity: bright streaks
          const v = Math.hypot(o.vx, o.vy, o.vz);
          dummy.lookAt(o.x + o.vx, o.y + o.vy, o.z + o.vz);
          dummy.scale.set(s * 0.55, s * 0.55, s * (1 + v * 0.12));
        } else {
          if (o.flat) dummy.rotation.set(Math.PI / 2, 0, 0);
          else if (o.face && this.camera) dummy.quaternion.copy(this.camera.quaternion);
          else dummy.rotation.set(o.rot, o.rot * 0.7, o.rot * 0.3);
          if (o.landed && o.kind !== 'bill') dummy.scale.set(s * 1.4, s * 0.25, s * 1.4); else dummy.scale.setScalar(s);
        }
        dummy.updateMatrix();
        mesh.setMatrixAt(n, dummy.matrix);
        const fade = o.kind === 'ring' ? Math.max(0, o.life / o.l0) : 1;
        mesh.instanceColor.setXYZ(n, o.r[0] * fade, o.r[1] * fade, o.r[2] * fade);
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }
  }

  clear() { this.hit.clear(); this.smoke.clear(); for (const P of Object.values(this.pools)) { P.p.length = 0; P.mesh.count = 0; } }
}
