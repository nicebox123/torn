// TORN - GoreSystem: blood particles (bursts, heartbeat stump spray, drips, mist), flesh chunks & bone shards,
// spreading slippery blood pools, bloody handprints, and the FULL / LOW / OFF (stuffing) gore settings.
import * as THREE from 'three';
import { CONFIG, PALETTE } from './config.js';
import { DECAL } from './decals.js';

const G = new THREE.Vector3(0, -9.8, 0);
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);

export class GoreSystem {
  constructor(game) {
    this.game = game; this.world = game.world; this.decals = game.decals;
    this.max = CONFIG.MAX_PARTICLES; this.quality = 1;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.06, metalness: 0.0 });
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mat, this.max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false;
    for (let i = 0; i < this.max; i++) { this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); this.mesh.setColorAt(i, new THREE.Color(PALETTE.blood)); }
    game.scene.add(this.mesh);
    this.parts = []; this.free = []; for (let i = this.max - 1; i >= 0; i--) this.free.push(i);
    this.emitters = []; this.pools = []; this.bloody = new Map(); this.bits = 0;
    // mist puffs
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    this.mistTex = new THREE.CanvasTexture(c);
    this.mists = []; for (let i = 0; i < 6; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.mistTex, color: PALETTE.blood, transparent: true, depthWrite: false, opacity: 0 })); s.visible = false; game.scene.add(s); this.mists.push({ s, t: 1 }); }
    this.poolTex = this.makePoolTex();
  }
  get mode() { return this.game.save?.data?.gore || 'FULL'; }
  get mult() { return (this.mode === 'LOW' ? 0.5 : 1) * this.quality; }
  bloodColor(c) { return new THREE.Color(c || PALETTE.blood); }

  // ---- particles ----------------------------------------------------------------------------
  spawn(pos, vel, size, color, kind = 'blood') {
    if (!this.free.length) return;
    const i = this.free.pop();
    this.parts.push({ i, p: pos.clone(), v: vel.clone(), life: kind === 'stuff' ? 3 : 2.2, size, kind, color: color.clone(), check: 0 });
    this.mesh.setColorAt(i, color);
  }
  // big tear: 40-80 droplets (halved on LOW / low FPS), mist, chunks & shards
  burst(pos, dir, { intensity = 1, color = null, chunks = true } = {}) {
    const off = this.mode === 'OFF';
    const col = off ? new THREE.Color(PALETTE.stuffing) : this.bloodColor(color);
    const n = Math.round((40 + Math.random() * 40) * this.mult * intensity);
    for (let k = 0; k < n; k++) {
      const v = dir.clone().normalize().multiplyScalar(off ? 1 + Math.random() * 1.5 : 2 + Math.random() * 4.5)
        .add(new THREE.Vector3((Math.random() - .5) * 3, Math.random() * 2.2, (Math.random() - .5) * 3).multiplyScalar(off ? 0.6 : 1));
      const sz = off ? 0.012 + Math.random() * 0.012 : 0.004 + Math.random() * 0.009;
      this.spawn(pos, v, sz, off ? col : col.clone().lerp(new THREE.Color(PALETTE.bloodDark), Math.random() * 0.4), off ? 'stuff' : 'blood');
    }
    this.mist(pos, off);
    const A = this.game.audio;
    if (off) { A?.play('poof', pos, { volume: 0.9 }); }
    if (chunks && this.mode === 'FULL' && this.quality > 0.5) { for (let k = 0; k < 3; k++) this.bit('flesh_chunk_' + (1 + k % 3), pos, dir); for (let k = 0; k < 2; k++) this.bit('bone_shard_' + (1 + k), pos, dir); }
    if (off) for (let k = 0; k < 3; k++) this.bit('stuffing_puff', pos, dir, true);
  }
  bit(model, pos, dir, floaty = false) {
    if (this.bits > 24) return;
    const o = this.game.models.get(model); o.position.copy(pos); o.rotation.set(Math.random() * 6, Math.random() * 6, 0); this.game.scene.add(o);
    const v = dir.clone().normalize().multiplyScalar(floaty ? 0.8 : 2 + Math.random() * 3).add(new THREE.Vector3((Math.random() - .5) * 2, 1 + Math.random() * 2, (Math.random() - .5) * 2));
    const b = this.game.phys.addRigid(o, 'bit', { size: 0.01, r: 0.012, vel: v, spin: 8 });
    b.born = this.game.phys.time - CONFIG.PART_LIFETIME + 10; // bits only live ~10 s
    this.bits++; b.onRemove = () => this.bits--;
    if (!floaty) b.onImpact = (bb, n, speed, hit) => { if (speed > 2) this.splat(n.p, hit.normal, 0.08); };
  }
  mist(pos, white = false) {
    const m = this.mists.find(x => x.t >= 1) || this.mists[0];
    m.t = 0; m.s.visible = true; m.s.position.copy(pos); m.s.material.color.set(white ? PALETTE.stuffing : PALETTE.blood);
  }
  // heartbeat-pulse spray from a stump for 2 s, then slow drips. obj = Object3D on the stump, dirLocal in obj space.
  spray(obj, dirLocal, { color = null, duration = 2, drips = 6 } = {}) {
    if (this.mode === 'OFF') { this.emitters.push({ obj, dirLocal, t: 0, dur: 0.6, kind: 'stuff', color: new THREE.Color(PALETTE.stuffing) }); return; }
    this.emitters.push({ obj, dirLocal, t: 0, dur: duration, kind: 'spray', color: this.bloodColor(color), acc: 0 });
    this.emitters.push({ obj, dirLocal, t: -duration, dur: drips, kind: 'drip', color: this.bloodColor(color), acc: 0 });
  }
  splat(p, normal, size = 0.25, { variant = null, dir = null, color = null } = {}) {
    if (this.mode === 'OFF') return;
    const v = variant ?? (dir && Math.random() < 0.6 ? (Math.random() < 0.5 ? DECAL.DIR1 : DECAL.DIR2) : Math.abs(normal.y) < 0.5 && Math.random() < 0.5 ? DECAL.DRIP : Math.floor(Math.random() * 2));
    this.decals.sizeMul = this.mode === 'LOW' ? 0.6 : 1;
    this.decals.add(p, normal, { variant: v, size, dir, color: color ? new THREE.Color(color) : null });
  }
  // ---- pools ----------------------------------------------------------------------------------
  makePoolTex() {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.beginPath();
    for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2; const r = 100 + 14 * Math.sin(a * 3 + 1) + 8 * Math.sin(a * 7) + 5 * Math.sin(a * 13 + 2); const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.fill(); const t = new THREE.CanvasTexture(c); return t;
  }
  pool(pos, maxR = 0.25 + Math.random() * 0.3, color = null) {
    if (this.mode === 'OFF') return;
    const hit = this.world.raycast(pos.clone().add(new THREE.Vector3(0, 0.1, 0)), new THREE.Vector3(0, -1, 0), 3);
    if (!hit || hit.normal.y < 0.7) return;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: color || PALETTE.bloodDark, roughness: 0.05, metalness: 0.1, alphaMap: this.poolTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = Math.random() * 6; mesh.position.copy(hit.point).add(new THREE.Vector3(0, 0.006 + this.pools.length * 0.0004, 0)); mesh.scale.setScalar(0.05); mesh.renderOrder = 1;
    this.game.scene.add(mesh);
    const zone = this.world.addPool(hit.point, 0.02, 'slip');
    this.pools.push({ mesh, zone, r: 0.02, maxR, t: 0 });
    while (this.pools.length > CONFIG.MAX_POOLS) { const o = this.pools.shift(); o.mesh.removeFromParent(); this.world.removePool(o.zone); }
  }
  nearPool(p) { for (const pl of this.pools) { const dx = p.x - pl.mesh.position.x, dz = p.z - pl.mesh.position.z; if (Math.abs(p.y - pl.mesh.position.y) < 0.12 && dx * dx + dz * dz < pl.r * pl.r) return true; } return false; }
  // ---- bloody handprints: hands that touch blood leave prints on the next 6 surfaces ---------------
  markBloody(key, color = null) { if (this.mode !== 'OFF') this.bloody.set(key, { n: 6, color }); }
  handContact(key, point, normal) {
    const b = this.bloody.get(key); if (!b || b.n <= 0) return;
    this.decals.add(point.clone().addScaledVector(normal, -0.05), normal, { variant: DECAL.HAND, size: 0.14, alpha: b.n / 6, color: b.color ? new THREE.Color(b.color) : null });
    b.n--;
  }
  clear() {
    for (const p of this.parts) { this.mesh.setMatrixAt(p.i, _m.makeScale(0, 0, 0)); this.free.push(p.i); } this.parts = []; this.mesh.instanceMatrix.needsUpdate = true;
    this.emitters = []; for (const pl of this.pools) { pl.mesh.removeFromParent(); this.world.removePool(pl.zone); } this.pools = []; this.bloody.clear();
  }
  // ---- update ---------------------------------------------------------------------------------
  update(dt) {
    // emitters
    for (const e of this.emitters) {
      e.t += dt; if (e.t < 0) continue;
      if (!e.obj.parent) { e.t = e.dur; continue; }
      const pos = e.obj.getWorldPosition(new THREE.Vector3());
      const dir = e.dirLocal.clone().applyQuaternion(e.obj.getWorldQuaternion(_q)).normalize();
      if (e.kind === 'spray') {
        const bpm = 90 * (1 - 0.5 * e.t / e.dur), ph = (e.t * bpm / 60) % 1;
        const pulse = Math.exp(-(((ph - 0.08) / 0.06) ** 2)) + 0.45 * Math.exp(-(((ph - 0.32) / 0.06) ** 2)); // strong-weak
        e.acc += pulse * 260 * dt * this.mult * (1 - 0.6 * e.t / e.dur);
        while (e.acc > 1) { e.acc--; this.spawn(pos, dir.clone().multiplyScalar(1.4 + pulse * 2.4).add(new THREE.Vector3((Math.random() - .5) * 0.4, (Math.random() - .5) * 0.4, (Math.random() - .5) * 0.4)), 0.004 + Math.random() * 0.004, e.color); }
      } else if (e.kind === 'drip') {
        e.acc += dt * 2.2; if (e.acc > 1) { e.acc = -Math.random(); this.spawn(pos, new THREE.Vector3(0, -0.2, 0), 0.006, e.color); }
      } else if (e.kind === 'stuff') {
        e.acc = (e.acc || 0) + dt * 60 * this.mult; while (e.acc > 1) { e.acc--; this.spawn(pos, dir.clone().multiplyScalar(0.8).add(new THREE.Vector3((Math.random() - .5), Math.random(), (Math.random() - .5)).multiplyScalar(0.6)), 0.012, e.color, 'stuff'); }
      }
    }
    this.emitters = this.emitters.filter(e => e.t < e.dur);
    // particles
    const alive = [];
    for (const p of this.parts) {
      p.life -= dt;
      if (p.kind === 'stuff') { p.v.multiplyScalar(Math.pow(0.15, dt)); p.v.y -= 0.6 * dt; }
      else p.v.addScaledVector(G, dt);
      p.p.addScaledVector(p.v, dt);
      let dead = p.life <= 0;
      if (!dead && ++p.check % 2 === 0) {
        const b = this.world.overlaps(p.p, 0.01);
        if (b) {
          dead = true;
          if (p.kind === 'blood') {
            const hit = this.world.resolveSphere(p.p.clone(), 0.02, null, 1);
            const n = hit ? hit.normal : new THREE.Vector3(0, 1, 0);
            if (Math.random() < 0.22) this.splat(p.p, n, 0.08 + p.size * 18, { dir: p.v.length() > 3 ? p.v : null, color: p.color });
            if (Math.random() < 0.04) this.game.audio?.play('splat', p.p, { volume: 0.25 });
          }
        } else if (p.kind === 'blood' && Math.random() < 0.02) {
          const hitC = this.game.creatureAt?.(p.p); if (hitC) { dead = true; this.decals.addToObject(hitC.obj, p.p, p.v.clone().negate().normalize(), Math.floor(Math.random() * 2), 0.06, p.color); }
        }
      }
      if (dead) { this.mesh.setMatrixAt(p.i, _m.makeScale(0, 0, 0)); this.free.push(p.i); continue; }
      const sp = p.v.length();
      _q.setFromUnitVectors(Z, sp > 1e-3 ? _v.copy(p.v).divideScalar(sp) : Z);
      const st = p.kind === 'blood' ? 1 + Math.min(4, sp * 0.5) : 1;
      _m.compose(p.p, _q, _s.set(p.size, p.size, p.size * st));
      this.mesh.setMatrixAt(p.i, _m);
      alive.push(p);
    }
    this.parts = alive;
    this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    for (const m of this.mists) { if (m.t >= 1) continue; m.t += dt / 0.6; const k = Math.min(1, m.t); m.s.scale.setScalar(0.2 + 0.7 * k); m.s.material.opacity = 0.45 * (1 - k); if (k >= 1) m.s.visible = false; }
    for (const pl of this.pools) { pl.t += dt; if (pl.r < pl.maxR) { pl.r = Math.min(pl.maxR, pl.r + dt * 0.12); pl.mesh.scale.setScalar(pl.r * 2.3); pl.zone.radius = pl.r; } }
  }
}
