// TORN - collision world: axis-aligned boxes with a surface type, on a spatial hash.
// Used by locomotion (hands + body), bots, loose body parts, blood particles and line-of-sight.
import * as THREE from 'three';

const CELL = 2;
const _q = new THREE.Vector3(), _d = new THREE.Vector3();

export class World {
  constructor() {
    this.boxes = []; this.grid = new Map(); this.dynamic = []; this.pools = []; this.stamp = 0;
    this.bounds = new THREE.Box3(new THREE.Vector3(-40, -5, -40), new THREE.Vector3(40, 30, 40));
  }
  key(x, y, z) { return (x * 73856093) ^ (y * 19349663) ^ (z * 83492791); }
  addBox(min, max, surface = 'metal', tag = '') {
    const b = { min: new THREE.Vector3(Math.min(min.x, max.x), Math.min(min.y, max.y), Math.min(min.z, max.z)),
      max: new THREE.Vector3(Math.max(min.x, max.x), Math.max(min.y, max.y), Math.max(min.z, max.z)), surface, tag, id: this.boxes.length, mark: 0, enabled: true };
    this.boxes.push(b);
    for (let x = Math.floor(b.min.x / CELL); x <= Math.floor(b.max.x / CELL); x++)
      for (let y = Math.floor(b.min.y / CELL); y <= Math.floor(b.max.y / CELL); y++)
        for (let z = Math.floor(b.min.z / CELL); z <= Math.floor(b.max.z / CELL); z++) {
          const k = this.key(x, y, z); let l = this.grid.get(k); if (!l) this.grid.set(k, l = []); l.push(b);
        }
    return b;
  }
  // box given by centre & size, optionally rotated by multiples of 90 deg around Y
  addCentered(c, size, surface, tag) { return this.addBox(new THREE.Vector3(c.x - size.x / 2, c.y - size.y / 2, c.z - size.z / 2), new THREE.Vector3(c.x + size.x / 2, c.y + size.y / 2, c.z + size.z / 2), surface, tag); }
  addDynamic(b) { b.enabled = true; this.dynamic.push(b); return b; }

  query(c, r, fn) {
    this.stamp++;
    const x0 = Math.floor((c.x - r) / CELL), x1 = Math.floor((c.x + r) / CELL);
    const y0 = Math.floor((c.y - r) / CELL), y1 = Math.floor((c.y + r) / CELL);
    const z0 = Math.floor((c.z - r) / CELL), z1 = Math.floor((c.z + r) / CELL);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const l = this.grid.get(this.key(x, y, z)); if (!l) continue;
      for (const b of l) { if (b.mark === this.stamp || !b.enabled) continue; b.mark = this.stamp; if (fn(b) === false) return; }
    }
    for (const b of this.dynamic) if (b.enabled && fn(b) === false) return;
  }
  // Push a sphere out of all boxes. Mutates c. Returns contact info or null.
  resolveSphere(c, r, out = null, iterations = 3) {
    let hit = null;
    for (let it = 0; it < iterations; it++) {
      let any = false;
      this.query(c, r, b => {
        _q.set(Math.max(b.min.x, Math.min(c.x, b.max.x)), Math.max(b.min.y, Math.min(c.y, b.max.y)), Math.max(b.min.z, Math.min(c.z, b.max.z)));
        _d.subVectors(c, _q); const dist = _d.length();
        if (dist >= r) return;
        let n;
        if (dist > 1e-6) { n = _d.clone().multiplyScalar(1 / dist); c.addScaledVector(n, r - dist); }
        else { // centre inside: push out along the shallowest axis
          const px = [c.x - b.min.x, b.max.x - c.x, c.y - b.min.y, b.max.y - c.y, c.z - b.min.z, b.max.z - c.z];
          let k = 0; for (let i = 1; i < 6; i++) if (px[i] < px[k]) k = i;
          n = new THREE.Vector3([-1, 1, 0, 0, 0, 0][k], [0, 0, -1, 1, 0, 0][k], [0, 0, 0, 0, -1, 1][k]);
          c.addScaledVector(n, px[k] + r);
        }
        any = true;
        if (!hit || n.y > hit.normal.y) hit = { normal: n, surface: b.surface, box: b, point: _q.clone() };
      });
      if (!any) break;
    }
    if (hit) hit.surface = this.surfaceOverride(c, hit.surface);
    if (out && hit) Object.assign(out, hit);
    return hit;
  }
  overlaps(c, r) {
    let found = null;
    this.query(c, r, b => {
      _q.set(Math.max(b.min.x, Math.min(c.x, b.max.x)), Math.max(b.min.y, Math.min(c.y, b.max.y)), Math.max(b.min.z, Math.min(c.z, b.max.z)));
      if (_q.distanceToSquared(c) < r * r) { found = b; return false; }
    });
    return found;
  }
  // Ray vs boxes (slab test), walking cells along the ray. Returns {dist, point, normal, box} or null.
  raycast(o, dir, maxDist) {
    let best = null; const steps = Math.ceil(maxDist / CELL) + 1;
    const seen = new Set();
    for (let s = 0; s <= steps; s++) {
      const t = Math.min(maxDist, s * CELL);
      const p = _q.copy(o).addScaledVector(dir, t);
      this.query(p, CELL * 0.9, b => {
        if (seen.has(b)) return; seen.add(b);
        let tmin = 0, tmax = maxDist, axis = -1, sgn = 1;
        for (const a of ['x', 'y', 'z']) {
          if (Math.abs(dir[a]) < 1e-9) { if (o[a] < b.min[a] || o[a] > b.max[a]) return; continue; }
          let t1 = (b.min[a] - o[a]) / dir[a], t2 = (b.max[a] - o[a]) / dir[a], s1 = -1;
          if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s1 = 1; }
          if (t1 > tmin) { tmin = t1; axis = a; sgn = s1 * Math.sign(dir[a]) * -1 * -1; sgn = dir[a] > 0 ? -1 : 1; }
          tmax = Math.min(tmax, t2); if (tmin > tmax) return;
        }
        if (axis === -1) return; // origin inside
        if (!best || tmin < best.dist) {
          const n = new THREE.Vector3(); n[axis] = sgn;
          best = { dist: tmin, point: o.clone().addScaledVector(dir, tmin), normal: n, box: b };
        }
      });
      if (best && best.dist < t) break;
    }
    return best;
  }
  // Sphere swept from o along unit dir up to maxDist (like Unity Physics.SphereCast: boxes the sphere already
  // overlaps at the start are ignored). Ray vs. box grown by r; corners treated as square. -> {distance, point, normal, box}
  sphereCast(o, r, dir, maxDist) {
    if (!(maxDist > 0)) return null;
    let best = null;
    const mid = _q.copy(o).addScaledVector(dir, maxDist / 2);
    this.query(mid.clone(), maxDist / 2 + r + 0.05, b => {
      let tmin = 0, tmax = maxDist, axis = null, sgn = 0, inside = true;
      for (const a of ['x', 'y', 'z']) {
        const lo = b.min[a] - r, hi = b.max[a] + r;
        if (o[a] <= lo || o[a] >= hi) inside = false;
        if (Math.abs(dir[a]) < 1e-12) { if (o[a] < lo || o[a] > hi) return; continue; }
        let t1 = (lo - o[a]) / dir[a], t2 = (hi - o[a]) / dir[a];
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        if (t1 > tmin || axis === null && t1 >= tmin) { if (t1 >= tmin) { tmin = t1; axis = a; sgn = dir[a] > 0 ? -1 : 1; } }
        tmax = Math.min(tmax, t2); if (tmin > tmax) return;
      }
      if (inside || axis === null) return;
      if (!best || tmin < best.distance) {
        const n = new THREE.Vector3(); n[axis] = sgn;
        const c = o.clone().addScaledVector(dir, tmin);
        best = { distance: tmin, point: c.addScaledVector(n, -r), normal: n, box: b };
      }
    });
    return best;
  }
  lineOfSight(a, b) {
    const d = _d.subVectors(b, a); const L = d.length(); if (L < 1e-4) return true;
    const dir = d.clone().divideScalar(L);
    const h = this.raycast(a, dir, L);
    return !h;
  }
  // Blood pools & goo zones turn surfaces slippery
  addPool(pos, radius, surface = 'slip') { const p = { pos: pos.clone(), radius, surface }; this.pools.push(p); return p; }
  removePool(p) { const i = this.pools.indexOf(p); if (i >= 0) this.pools.splice(i, 1); }
  surfaceOverride(p, s) {
    for (const pool of this.pools) {
      const dx = p.x - pool.pos.x, dz = p.z - pool.pos.z;
      if (Math.abs(p.y - pool.pos.y) < 0.35 && dx * dx + dz * dz < pool.radius * pool.radius) return pool.surface;
    }
    return s;
  }
  clampBounds(p) { p.clamp(this.bounds.min, this.bounds.max); }
}
