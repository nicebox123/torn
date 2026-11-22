// TORN - The Facility. Builds the map from modular Blender pieces on a 1 m grid, adds colliders,
// merges static geometry per region (few draw calls for Quest), and runs lights, chains and vent grates.
//
// World layout (metres, +Y up):
//   Spawn Room  x 0..10,   z -10..0,  4 m tall. Doors (x=2, x=8) open north into the hall.
//   Main Hall   x -10..20, z 0..30,  16 m tall (raised from 12 so the 15 m tower fits). Catwalks at 3 m and 6 m.
//   Lab Rooms   x -18..-10, z 4..12 / 12..20 / 20..28, 4 m tall, doors into the hall's west wall.
//   Vents       V1 spawn->lab1, V2 hall east loop, V3 lab2->lab3 (0.6 m: survivors only).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { planarUV } from './models.js';

const D90 = Math.PI / 2;
// piece-local bounds & colliders in three.js space (front = +Z, wall thickness toward -Z)
const PIECES = {
  wall_straight: { b: [0, 0, -0.2, 4, 4, 0.05], c: [[0, 0, -0.2, 4, 4, 0]] },
  wall_spawn: { b: [0, 0, -0.2, 4, 4, 0.05], c: [[0, 0, -0.2, 4, 4, 0]] },
  wall_plain: { b: [0, 0, -0.2, 4, 4, 0.05], c: [[0, 0, -0.2, 4, 4, 0]] },
  wall_doorway: { b: [0, 0, -0.24, 4, 4, 0.05], c: [[0, 0, -0.2, 1, 4, 0], [3, 0, -0.2, 4, 4, 0], [1, 3, -0.2, 3, 4, 0]] },
  wall_window: { b: [0, 0, -0.26, 4, 4, 0.05], c: [[0, 0, -0.2, 4, 1.2, 0], [0, 2.4, -0.2, 4, 4, 0], [0, 1.2, -0.2, 1, 2.4, 0], [3, 1.2, -0.2, 4, 2.4, 0]] },
  wall_corner: { b: [0, 0, -0.4, 0.4, 4, 0], c: [[0, 0, -0.4, 0.4, 4, 0]] },
  floor_tile: { b: [0, -0.06, -4, 4, 0.01, 0], c: [[0, -0.6, -4, 4, 0, 0]] },
  ceiling_tile: { b: [0, -0.2, -4, 4, 0.1, 0], c: [] },
  catwalk_straight: { b: [0, -0.1, -1.2, 2, 1.05, 0], c: [[0, -0.1, -1.2, 2, 0, 0, 'metal'], [0, 0, -0.07, 2, 1.05, 0, 'climb']] },
  catwalk_corner: { b: [0, -0.1, -1.2, 1.2, 1.05, 0], c: [[0, -0.1, -1.2, 1.2, 0, 0, 'metal'], [0, 0, -0.07, 1.2, 1.05, 0, 'climb'], [1.13, 0, -1.2, 1.2, 1.05, 0, 'climb']] },
  ladder: { b: [0, 0, -0.08, 0.5, 3, 0], c: [[0, 0, -0.08, 0.5, 3, 0, 'climb']] },
  pipe_straight: { b: [0, 0, -0.15, 2, 0.15, 0], c: [[0, 0, -0.15, 2, 0.15, 0, 'climb']] },
  tower_section: { b: [0, 0, -4, 4, 3, 0], c: [[1, 0, -3, 3, 3, -1, 'climb'], [0, 2.9, -0.7, 4, 3, 0], [0, 2.9, -4, 4, 3, -3.3], [0, 2.9, -3.3, 0.7, 3, -0.7], [3.3, 2.9, -3.3, 4, 3, -0.7],
    [0, 0, -0.2, 0.2, 3, 0, 'climb'], [3.8, 0, -0.2, 4, 3, 0, 'climb'], [0, 0, -4, 0.2, 3, -3.8, 'climb'], [3.8, 0, -4, 4, 3, -3.8, 'climb'],
    [1.4, 1.46, -1.0, 2.6, 1.54, -0.5], [3.0, 0.96, -2.6, 3.5, 1.04, -1.4], [0.82, 0, -0.98, 0.98, 3, -0.82, 'climb'], [3.02, 0, -3.18, 3.18, 3, -3.02, 'climb']] },
  vent_straight: { b: [0, 0, -0.66, 2, 0.66, 0], c: [] },
  vent_corner: { b: [0, 0, -0.66, 0.66, 0.66, 0], c: [] },
  metal_crate: { b: [-0.5, 0, -0.5, 0.5, 1, 0.5], c: [[-0.5, 0, -0.5, 0.5, 1, 0.5]] },
  metal_barrel: { b: [-0.31, 0, -0.31, 0.31, 0.9, 0.31], c: [[-0.3, 0, -0.3, 0.3, 0.9, 0.3]] },
  surgical_table: { b: [-0.95, 0, -0.36, 1.5, 0.92, 0.36], c: [[-0.95, 0.8, -0.35, 0.95, 0.88, 0.35], [-0.9, 0, -0.1, 0.9, 0.8, 0.1]] },
  glass_tank_broken: { b: [-0.55, 0, -0.55, 0.55, 2.4, 0.55], c: [[-0.55, 0, -0.55, 0.55, 0.3, 0.55], [-0.5, 1.85, -0.5, 0.5, 2.0, 0.5], [0.42, 0.3, -0.5, 0.5, 1.85, 0.5, 'climb'], [-0.5, 0.3, -0.5, -0.42, 1.85, 0.5, 'climb'], [-0.5, 0.3, -0.5, 0.5, 1.85, -0.42, 'climb']] },
  metal_shelf: { b: [-0.62, 0, -0.22, 0.62, 1.8, 0.22], c: [[-0.62, 0, -0.22, 0.62, 1.8, 0.22, 'climb']] },
  body_bag: { b: [-0.95, 0, -0.3, 0.95, 0.3, 0.3], c: [[-0.95, 0, -0.3, 0.95, 0.26, 0.3, 'bouncy']] },
  trash_pile: { b: [-0.6, 0, -0.5, 0.6, 0.1, 0.5], c: [] },
  blood_bucket: { b: [-0.17, 0, -0.17, 0.35, 0.46, 0.25], c: [[-0.16, 0, -0.16, 0.16, 0.35, 0.16]] },
  warning_sign: { b: [-0.35, -0.2, -0.02, 0.35, 0.2, 0.01], c: [] },
  warning_sign_noentry: { b: [-0.35, -0.2, -0.02, 0.35, 0.2, 0.01], c: [] },
  warning_sign_subjects: { b: [-0.45, -0.23, -0.02, 0.45, 0.23, 0.01], c: [] },
  sign_testing_area: { b: [-0.8, -0.18, -0.02, 0.8, 0.18, 0.01], c: [] },
  emergency_light: { b: [-0.09, -0.09, -0.04, 0.09, 0.09, 0.15], c: [] },
  valve_wheel: { b: [-0.16, 0, -0.16, 0.16, 0.18, 0.16], c: [] },
};

export class Facility {
  constructor(game) {
    this.game = game; this.scene = game.scene; this.models = game.models; this.world = game.world;
    this.batches = {}; this.lights = []; this.chains = []; this.grates = []; this.root = new THREE.Group(); this.root.name = 'facility';
    this.scene.add(this.root);
    this.matCache = new Map();
    this.waypoints = []; this.wpIndex = new Map();
  }
  // ---- placement helpers -----------------------------------------------------------------------
  _xf(name, rotY, scale) {
    const m = new THREE.Matrix4().makeRotationY(rotY);
    if (scale) m.multiply(new THREE.Matrix4().makeScale(scale[0], scale[1], scale[2]));
    return m;
  }
  _boundsWorld(b, m) {
    const box = new THREE.Box3(); const v = new THREE.Vector3();
    for (let i = 0; i < 8; i++) { v.set(i & 1 ? b[3] : b[0], i & 2 ? b[4] : b[1], i & 4 ? b[5] : b[2]).applyMatrix4(m); box.expandByPoint(v); }
    return box;
  }
  // Place a piece so its rotated bounding box min corner lands at `min`. Returns the object (if not batched).
  place(name, rotY, min, { scale = null, region = 'hall', surface = 'metal', batch = true, colliders = true } = {}) {
    const def = PIECES[name]; const m = this._xf(name, rotY, scale);
    const wb = this._boundsWorld(def ? def.b : [0, 0, 0, 0, 0, 0], m);
    const pos = new THREE.Vector3(min[0], min[1], min[2]).sub(wb.min);
    const full = new THREE.Matrix4().makeTranslation(pos.x, pos.y, pos.z).multiply(m);
    if (def && colliders) for (const c of def.c) {
      const cb = this._boundsWorld(c, full);
      this.world.addBox(cb.min, cb.max, c[6] || surface, name);
    }
    const obj = this.models.get(name);
    if (batch) { this._batch(region, obj, full); return null; }
    obj.matrixAutoUpdate = true; obj.position.copy(pos); obj.rotation.y = rotY; if (scale) obj.scale.set(...scale);
    this.root.add(obj); return obj;
  }
  // Place by origin position (not min corner), for props
  prop(name, x, y, z, rotY = 0, opts = {}) {
    const def = PIECES[name]; const m = this._xf(name, rotY, opts.scale);
    const full = new THREE.Matrix4().makeTranslation(x, y, z).multiply(m);
    if (def && opts.colliders !== false) for (const c of def.c) { const cb = this._boundsWorld(c, full); this.world.addBox(cb.min, cb.max, c[6] || opts.surface || 'metal', name); }
    const obj = this.models.get(name);
    if (opts.batch !== false) { this._batch(opts.region || 'hall', obj, full); return null; }
    obj.position.set(x, y, z); obj.rotation.y = rotY; if (opts.scale) obj.scale.set(...opts.scale); this.root.add(obj); return obj;
  }
  _lambert(m) {
    const key = m.name + '|' + m.color.getHexString() + '|' + (m.emissive ? m.emissive.getHexString() : '') + (m.transparent ? 't' : '');
    if (!this.matCache.has(key)) {
      const L = new THREE.MeshLambertMaterial({ color: m.color, emissive: m.emissive || 0x000000, emissiveIntensity: m.emissiveIntensity || 1,
        transparent: m.transparent || m.opacity < 1, opacity: m.opacity, side: m.transparent ? THREE.DoubleSide : THREE.FrontSide, name: m.name });
      if (m.metalness > 0.5) L.color.multiplyScalar(0.8);
      this.matCache.set(key, L);
    }
    return this.matCache.get(key);
  }
  _batch(region, obj, matrix) {
    obj.updateMatrixWorld(true);
    const B = this.batches[region] || (this.batches[region] = new Map());
    obj.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      let g = o.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(matrix, o.matrixWorld));
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (g.index) g = g.toNonIndexed();
      const groups = g.groups.length ? g.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
      for (const gr of groups) {
        const mat = this._lambert(mats[gr.materialIndex] || mats[0]);
        const part = new THREE.BufferGeometry();
        for (const k of ['position', 'normal']) {
          const a = g.attributes[k]; part.setAttribute(k, new THREE.BufferAttribute(a.array.slice(gr.start * 3, (gr.start + gr.count) * 3), 3));
        }
        if (!B.has(mat)) B.set(mat, []);
        B.get(mat).push(part);
      }
    });
  }
  finishBatches() {
    for (const [region, B] of Object.entries(this.batches)) {
      for (const [mat, geos] of B) {
        const merged = mergeGeometries(geos, false); if (!merged) continue;
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, mat); mesh.name = 'static_' + region + '_' + mat.name; mesh.matrixAutoUpdate = false;
        this.root.add(mesh);
      }
    }
    this.batches = {};
  }

  // A run of wall pieces. start = corner where the run begins, n = inward normal (axis aligned), len metres.
  // types(i, s) -> piece name for the segment starting s metres along. Lower level only if level0.
  wallRun(start, n, len, { y = 0, types = () => 'wall_straight', region = 'hall', skip = () => false } = {}) {
    const d = new THREE.Vector3(n.z, 0, -n.x);
    const rotY = Math.atan2(n.x, n.z);   // piece local +Z -> n, local +X -> d
    for (let s = 0, i = 0; s < len - 0.01; s += 4, i++) {
      const L = Math.min(4, len - s);
      if (skip(s, L)) continue;
      this.prop(types(i, s, L), start.x + d.x * s, y, start.z + d.z * s, rotY, { scale: [L / 4, 1, 1], region });
    }
  }
  // Solid wall with a 0.6 m vent hole at floor level, `off` metres along the run
  ventWall(start, n, len, off, { region = 'hall', type = 'wall_straight' } = {}) {
    const d = new THREE.Vector3(n.z, 0, -n.x), rotY = Math.atan2(n.x, n.z);
    for (const [s0, s1, y0, y1] of [[0, off, 0, 4], [off + 0.6, len, 0, 4], [off, off + 0.6, 0.66, 4]]) {
      if (s1 - s0 < 0.01) continue;
      this.prop(type, start.x + d.x * s0, y0, start.z + d.z * s0, rotY, { scale: [(s1 - s0) / 4, (y1 - y0) / 4, 1], region });
    }
  }
  // Vent duct along an axis-aligned polyline at floor level (centre line). Builds visuals + colliders.
  duct(points, region = 'vents') {
    const W = 0.66, h = 0.66;
    for (let i = 0; i < points.length - 1; i++) {
      const a = new THREE.Vector3(...points[i]), b = new THREE.Vector3(...points[i + 1]);
      const along = Math.abs(b.x - a.x) > 0.01 ? 'x' : 'z';
      const sg = Math.sign(b[along] - a[along]);
      const sA = a[along] - sg * (i > 0 ? W / 2 : 0), sB = b[along] + sg * (i < points.length - 2 ? W / 2 : 0);
      const lo = Math.min(sA, sB), hi = Math.max(sA, sB);
      const c = along === 'x' ? a.z : a.x;
      const mk = (x0, y0, z0, x1, y1, z1, s = 'metal') => this.world.addBox(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1), s, 'vent');
      if (along === 'x') {
        mk(lo, -0.3, c - W / 2, hi, 0.03, c + W / 2); mk(lo, 0.63, c - W / 2, hi, 0.9, c + W / 2);
        mk(lo, 0, c - W / 2 - 0.2, hi, h, c - 0.3); mk(lo, 0, c + 0.3, hi, h, c + W / 2 + 0.2);
      } else {
        mk(c - W / 2, -0.3, lo, c + W / 2, 0.03, hi); mk(c - W / 2, 0.63, lo, c + W / 2, 0.9, hi);
        mk(c - W / 2 - 0.2, 0, lo, c - 0.3, h, hi); mk(c + 0.3, 0, lo, c + W / 2 + 0.2, h, hi);
      }
      const L = hi - lo; const n = Math.max(1, Math.round(L / 2));
      for (let k = 0; k < n; k++) {
        const s0 = lo + k * L / n, sc = [L / n / 2, 1, 1];
        if (along === 'x') this.place('vent_straight', 0, [s0, 0, c - W / 2], { scale: sc, region, colliders: false });
        else this.place('vent_straight', -D90, [c - W / 2, 0, s0], { scale: sc, region, colliders: false });
      }
    }
  }
  grate(x, z, rotY) {
    const obj = this.models.get('vent_grate');
    const pivot = new THREE.Group(); pivot.position.set(x, 0.66, z); pivot.rotation.y = rotY; this.root.add(pivot);
    obj.position.set(-0.33, -0.66, 0.0); pivot.add(obj);
    const n = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY));
    const box = { min: new THREE.Vector3(), max: new THREE.Vector3(), surface: 'metal', tag: 'grate', enabled: true };
    const t = new THREE.Vector3(Math.cos(rotY), 0, -Math.sin(rotY));
    const c = new THREE.Vector3(x, 0.33, z);
    box.min.set(c.x - Math.abs(t.x) * 0.3 - Math.abs(n.x) * 0.03, 0.03, c.z - Math.abs(t.z) * 0.3 - Math.abs(n.z) * 0.03);
    box.max.set(c.x + Math.abs(t.x) * 0.3 + Math.abs(n.x) * 0.03, 0.63, c.z + Math.abs(t.z) * 0.3 + Math.abs(n.z) * 0.03);
    this.world.addDynamic(box);
    this.grates.push({ pivot, box, center: c, n, angle: 0, target: 0, openTimer: 0 });
  }
  light(x, y, z, rotY = 0, steady = false, region = 'hall') {
    const obj = this.models.get('ceiling_light', ['Fluorescent']);
    obj.position.set(x, y, z); obj.rotation.y = rotY; this.root.add(obj);
    const tubes = []; obj.traverse(o => { if (o.isMesh && o.material && o.material.name === 'Fluorescent') tubes.push(o); });
    const mats = [...new Set(tubes.map(t => t.material))];
    // fake light pool on the floor (cheap glow instead of real lights)
    const pool = new THREE.Mesh(new THREE.CircleGeometry(steady ? 3.2 : 2.6, 24), this.poolMat());
    pool.rotation.x = -Math.PI / 2; pool.position.set(x, this.floorBelow(x, y, z) + 0.02, z); pool.renderOrder = 1; this.root.add(pool);
    const L = { obj, mats, pool, steady, t: Math.random() * 10, state: 1, timer: Math.random() * 5, pattern: null, level: 1 };
    this.lights.push(L); return L;
  }
  floorBelow(x, y, z) { const h = this.world.raycast(new THREE.Vector3(x, y - 0.3, z), new THREE.Vector3(0, -1, 0), 30); return h ? h.point.y : 0; }
  poolMat() {
    if (this._poolMat) return this._poolMat;
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(221,239,232,0.55)'); gr.addColorStop(0.5, 'rgba(221,239,232,0.18)'); gr.addColorStop(1, 'rgba(221,239,232,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    this._poolMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 });
    return this._poolMat;
  }
  emergency(x, y, z, rotY) {
    const obj = this.models.get('emergency_light', ['Emergency']);
    obj.position.set(x, y, z); obj.rotation.y = rotY; this.root.add(obj);
    let mat = null; obj.traverse(o => { if (o.isMesh && o.material && o.material.name === 'Emergency') mat = o.material; });
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex(), color: 0xff1e1e, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(1.6, 1.6, 1); glow.position.set(x + Math.sin(rotY) * 0.15, y, z + Math.cos(rotY) * 0.15); this.root.add(glow);
    this.lights.push({ emergency: true, mat, glow, t: Math.random() * 2 });
  }
  glowTex() {
    if (this._glow) return this._glow;
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); this._glow = new THREE.CanvasTexture(c); return this._glow;
  }
  chain(x, topY, z) {
    const obj = this.models.get('hanging_chain');
    const pivot = new THREE.Group(); pivot.position.set(x, topY, z); this.root.add(pivot); pivot.add(obj);
    const box = { min: new THREE.Vector3(), max: new THREE.Vector3(), surface: 'climb', tag: 'chain', enabled: true, vel: new THREE.Vector3() };
    this.world.addDynamic(box);
    this.chains.push({ pivot, box, ax: 0, az: 0, vx: 0, vz: 0, len: 3.0, tip: new THREE.Vector3(), prevTip: new THREE.Vector3(x, topY - 3, z) });
  }
  wp(id, x, y, z, links = [], climb = false) { const w = { id, pos: new THREE.Vector3(x, y, z), links: [], climb }; this.waypoints.push(w); this.wpIndex.set(id, w); for (const l of links) this.link(id, l); return w; }
  link(a, b) { const A = this.wpIndex.get(a), B = this.wpIndex.get(b); if (A && B) { if (!A.links.includes(B)) A.links.push(B); if (!B.links.includes(A)) B.links.push(A); } }

  // ---- the actual layout ----------------------------------------------------------------------
  build() {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const S = 'spawn', H = 'hall', LB = 'labs';
    // ---------- SPAWN ROOM
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) this.place('floor_tile', 0, [i * 4 - 1, -0.06, -10 - 2 + j * 4], { region: S });
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) this.place('ceiling_tile', 0, [i * 4 - 1, 3.8, -12 + j * 4], { region: S, colliders: false });
    this.world.addBox(V(-1, 4, -11), V(11, 4.5, 1), 'metal', 'ceiling');
    this.wallRun(V(0, 0, -10), V(0, 0, 1), 10, { region: S, types: () => 'wall_spawn' });                       // south
    this.wallRun(V(10, 0, 0), V(0, 0, -1), 4, { region: S, types: () => 'wall_doorway' });                       // north: door (x 7..9)
    this.wallRun(V(6, 0, 0), V(0, 0, -1), 2, { region: S, types: () => 'wall_spawn' });
    this.wallRun(V(4, 0, 0), V(0, 0, -1), 4, { region: S, types: () => 'wall_doorway' });                        // door (x 1..3)
    this.ventWall(V(0, 0, 0), V(1, 0, 0), 4, 1.8, { region: S, type: 'wall_spawn' });                              // west (vent V1)
    this.wallRun(V(0, 0, -4), V(1, 0, 0), 6, { region: S, types: () => 'wall_spawn' });
    this.wallRun(V(10, 0, -10), V(-1, 0, 0), 10, { region: S, types: () => 'wall_spawn' });                       // east
    for (const [x, z] of [[3.3, -3], [6.7, -7], [3.3, -7], [6.7, -3]]) this.light(x, 3.98, z, 0, true, S);
    this.spawnPoint = V(5, 0.25, -5); this.spawnYaw = D90;
    // props: computer (west wall, facing +X), mirror (south wall), shop (east wall), mode screen + sign (north wall)
    this.computer = this.prop('computer_terminal', 0.62, 0, -6, D90, { batch: false, colliders: false });
    this.world.addBox(V(0.2, 0, -6.6), V(1.0, 0.8, -5.4), 'metal', 'desk');
    this.world.addBox(V(0.0, 0.8, -6.36), V(0.8, 1.35, -5.68), 'metal', 'monitor');
    this.mirror = this.prop('mirror_frame', 3, 0.35, -9.96, 0, { batch: false, colliders: false });
    this.shop = this.prop('shop_stand', 9.68, 0, -5, -D90, { batch: false, colliders: false });
    this.world.addBox(V(9.85, 0, -5.75), V(10, 2.3, -4.25), 'climb', 'shop');
    this.modeScreen = this.prop('mode_screen', 5, 2.55, -0.02, Math.PI, { batch: false, colliders: false });
    this.prop('sign_testing_area', 5, 3.55, -0.03, Math.PI, { region: S, colliders: false });
    this.prop('trash_pile', 1.2, 0, -9, 0.6, { region: S });
    this.grate(0.0, -2.1, D90);  // spawn side of V1 (hole spans z -2.4..-1.8 on the west wall)

    // ---------- MAIN HALL (x -10..20, z 0..30, 16 m)
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) this.place('floor_tile', 0, [-10 + i * 4, -0.06, 0 + j * 4], { region: H });
    this.world.addBox(V(-10, 16, 0), V(20, 17, 30), 'metal', 'ceiling');
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshLambertMaterial({ color: 0x141616 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(5, 16, 15); this.root.add(ceil);
    for (let lv = 0; lv < 4; lv++) {
      const y = lv * 4, low = lv === 0;
      const t = low ? 'wall_straight' : 'wall_plain';
      if (low) { this.wallRun(V(-10, 0, 0), V(0, 0, 1), 10, { region: H }); this.wallRun(V(10, 0, 0), V(0, 0, 1), 10, { region: H }); }   // south (spawn in the middle)
      else this.wallRun(V(-10, y, 0), V(0, 0, 1), 30, { y, region: H, types: () => t });
      this.wallRun(V(20, y, 30), V(0, 0, -1), 30, { y, region: H, types: (i) => (low && i === 3) ? 'wall_window' : t });               // north
      if (low) {
        this.wallRun(V(-10, 0, 30), V(1, 0, 0), 30, { region: H, types: (i) => (i === 1 || i === 3 || i === 5) ? 'wall_doorway' : 'wall_straight' }); // west, lab doors
        this.ventWall(V(20, 0, 0), V(-1, 0, 0), 8, 3.7, { region: H });   // east with V2 entrance (z 3.7..4.3)
        this.wallRun(V(20, 0, 8), V(-1, 0, 0), 16, { region: H });
        this.ventWall(V(20, 0, 24), V(-1, 0, 0), 6, 1.7, { region: H });  // V2 exit (z 25.7..26.3)
      } else {
        this.wallRun(V(-10, y, 30), V(1, 0, 0), 30, { y, region: H, types: () => t });
        this.wallRun(V(20, y, 0), V(-1, 0, 0), 30, { y, region: H, types: () => t });
      }
    }
    for (const [x, z, r] of [[-10, 0, 0], [20, 0, -D90], [20, 30, Math.PI], [-10, 30, D90]]) this.place('wall_corner', r, [x - (x > 0 ? 0.4 : 0), 0, z - (z > 0 ? 0.4 : 0)], { region: H });
    // catwalks at 3 m and 6 m around the edges
    for (const y of [3, 6]) {
      for (let x = -8.8; x < 18.8 - 0.01; x += 2) { this.place('catwalk_straight', 0, [x, y - 0.1, 0], { region: H, scale: [Math.min(2, 18.8 - x) / 2, 1, 1] }); this.place('catwalk_straight', Math.PI, [x, y - 0.1, 28.8], { region: H, scale: [Math.min(2, 18.8 - x) / 2, 1, 1] }); }
      for (let z = 1.2; z < 28.8 - 0.01; z += 2) { this.place('catwalk_straight', D90, [-10, y - 0.1, z], { region: H, scale: [Math.min(2, 28.8 - z) / 2, 1, 1] }); this.place('catwalk_straight', -D90, [18.8, y - 0.1, z], { region: H, scale: [Math.min(2, 28.8 - z) / 2, 1, 1] }); }
      this.place('catwalk_corner', 0, [-10, y - 0.1, 0], { region: H }); this.place('catwalk_corner', -D90, [18.8, y - 0.1, 0], { region: H });
      this.place('catwalk_corner', Math.PI, [18.8, y - 0.1, 28.8], { region: H }); this.place('catwalk_corner', D90, [-10, y - 0.1, 28.8], { region: H });
    }
    // ladders (floor->3 m and 3->6 m) against the catwalk fronts
    for (const [x, y, z, r] of [[-3, 0, 1.2, 0], [12, 3, 1.2, 0], [4, 0, 28.72, Math.PI], [-8.8, 3, 18, -D90], [18.72, 0, 10, D90], [-8.8, 0, 6, -D90]]) {
      this.place('ladder', r, [x, y, z], { region: H });
    }
    // vertical climbing pipes
    for (const [x, z] of [[-9.85, 12], [19.7, 20], [8, 29.7]]) {
      const pipe = this.models.get('pipe_straight'); const m = new THREE.Matrix4().makeTranslation(x, 0, z).multiply(new THREE.Matrix4().makeRotationZ(D90)).multiply(new THREE.Matrix4().makeScale(4.5, 1, 1));
      this._batch(H, pipe, m); this.world.addBox(V(x - 0.15, 0, z - 0.15), V(x + 0.15, 9, z + 0.15), 'climb', 'pipe');
    }
    // central tower: 5 x 3 m sections = 15 m, with a platform & hidden cosmetic on top
    for (let k = 0; k < 5; k++) this.place('tower_section', 0, [3, k * 3, 13], { region: H, surface: 'climb' });
    this.world.addBox(V(3, 14.95, 13), V(7, 15.05, 17), 'metal', 'tower_top');
    this.towerPedestal = V(5, 15.05, 15);
    // girders + chains to swing on
    const gir = new THREE.MeshLambertMaterial({ color: 0x1e201f });
    for (const z of [8, 22]) { const g = new THREE.Mesh(new THREE.BoxGeometry(30, 0.4, 0.3), gir); g.position.set(5, 10, z); this.root.add(g); this.world.addBox(V(-10, 9.8, z - 0.15), V(20, 10.2, z + 0.15), 'climb', 'girder'); }
    for (const [x, z] of [[0, 8], [10, 8], [0, 22], [10, 22], [15, 8]]) this.chain(x, 9.8, z);
    // crates, barrels, body bags (bouncy), trash
    for (const [x, z, s] of [[-6, 4, 2], [-5, 4, 1], [-6, 5.1, 1], [14, 12, 2], [15.1, 12, 1], [16, 24, 3], [12, 26, 1], [-4, 22, 2]]) for (let k = 0; k < s; k++) this.prop('metal_crate', x, k, z, (x * 7 + k) % 2 ? 0 : D90);
    for (const [x, z] of [[-7, 9], [-6.2, 9.4], [16, 4], [17, 14], [1, 26], [12, 18], [9, 2.2]]) this.prop('metal_barrel', x, 0, z);
    this.prop('body_bag', 12, 0, 6, 0.4); this.prop('body_bag', -2, 0, 16, D90); this.prop('trash_pile', 17, 0, 27); this.prop('trash_pile', -8, 0, 20);
    this.prop('blood_bucket', 9.5, 0, 10, 0);
    this.prop('warning_sign', -9.78, 2.2, 15, D90, { colliders: false }); this.prop('warning_sign_subjects', 5, 2.5, 29.78, Math.PI, { colliders: false });
    this.prop('warning_sign_noentry', 19.78, 1.6, 4, -D90, { colliders: false });
    for (const [x, z] of [[-2, 4], [12, 4], [-2, 26], [12, 26], [5, 9], [5, 21]]) this.light(x, 9.6, z, 0);
    for (const [x, z, r] of [[-9.95, 0.6, D90], [19.95, 0.6, -D90], [19.95, 29.4, -D90], [-9.95, 29.4, D90]]) this.emergency(x, 2.6, z, r);
    // V2 vent: loop behind the east wall (survivor shortcut)
    this.duct([[19.9, 0, 4], [23, 0, 4], [23, 0, 26], [19.9, 0, 26]]);
    this.grate(20.0, 4, -D90); this.grate(20.0, 26, -D90);

    // ---------- LAB ROOMS (x -18..-10)
    const labs = [[4, 12], [12, 20], [20, 28]];
    labs.forEach(([z0, z1], li) => {
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) this.place('floor_tile', 0, [-18 + i * 4, -0.06, z0 + j * 4], { region: LB });
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) this.place('ceiling_tile', 0, [-18 + i * 4, 3.8, z0 + j * 4], { region: LB, colliders: false });
      this.world.addBox(V(-18.2, 4, z0), V(-10, 4.5, z1), 'metal', 'ceiling');
      if (li === 0) this.ventWall(V(-18, 0, 4), V(0, 0, 1), 8, 3.7, { region: LB });     // lab1 south wall with V1 exit
      if (li === 1) this.ventWall(V(-18, 0, 20), V(1, 0, 0), 8, 1.7, { region: LB });     // lab2 west wall with V3 (z 17.7..18.3)
      else if (li === 2) this.ventWall(V(-18, 0, 28), V(1, 0, 0), 8, 5.7, { region: LB }); // lab3 west wall with V3 exit (z 21.7..22.3)
      else this.wallRun(V(-18, 0, z1), V(1, 0, 0), 8, { region: LB });
      this.wallRun(V(-10, 0, z1), V(0, 0, -1), 8, { region: LB, types: () => li === 2 ? 'wall_straight' : 'wall_window' }); // north (shared)
      this.light(-14, 3.98, (z0 + z1) / 2, 0, false, LB);
      const zc = (z0 + z1) / 2;
      this.prop('surgical_table', -15.5, 0, zc - 1.6, 0, { region: LB });
      this.prop('glass_tank_broken', -16.8, 0, zc + 2.5, 0, { region: LB });
      this.prop('metal_shelf', -12, 0, z1 - 0.45, Math.PI, { region: LB });
      this.prop('body_bag', -13.5, 0, zc + 1, D90 + 0.3 * li, { region: LB });
      this.prop('trash_pile', -11.5, 0, z0 + 1.2, li, { region: LB });
      this.prop('blood_bucket', -17.3, 0, z0 + 0.8, 0, { region: LB });
    });
    this.world.addPool(V(-14, 0, 16), 1.6, 'sticky');   // dried goo in lab 2
    this.world.addPool(V(-13, 0, 24.5), 1.4, 'slip');   // organ goo in lab 3
    this.gooDecals = [[-14, 16, 1.6, '#4E6B2E'], [-13, 24.5, 1.4, '#7A1F1A']];
    // V1: spawn west wall -> west -> north -> lab1 south wall
    this.duct([[-0.1, 0, -2.1], [-14, 0, -2.1], [-14, 0, 3.9]]);
    this.grate(-14, 4.0, 0);
    // V3: lab2 west -> lab3 west
    this.duct([[-18, 0, 18], [-19.2, 0, 18], [-19.2, 0, 22], [-18, 0, 22]]);
    this.grate(-18.0, 18, D90); this.grate(-18.0, 22, D90);

    // invisible walls around everything
    this.world.bounds.set(V(-21, -2, -11), V(25, 17, 31));

    this.finishBatches();
    for (const d of this.gooDecals) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(d[2], 20), new THREE.MeshStandardMaterial({ color: d[3], roughness: 0.2, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.rotation.x = -Math.PI / 2; m.position.set(d[0], 0.012, d[1]); this.root.add(m);
    }
    this.buildWaypoints();
    // screens get UVs for canvas textures
    for (const o of [this.computer, this.modeScreen]) { const s = o && o.getObjectByName('screen'); if (s && s.isMesh) planarUV(s, 'xy'); }
  }

  buildWaypoints() {
    const W = (id, x, y, z, l, c) => this.wp(id, x, y, z, l, c);
    W('s_c', 5, 0, -5, []); W('s_l', 2, 0, -1.5, ['s_c']); W('s_r', 8, 0, -1.5, ['s_c']); W('s_m', 5, 0, -8.5, ['s_c']);
    W('h_dl', 2, 0, 2, ['s_l']); W('h_dr', 8, 0, 2, ['s_r']);
    const grid = [[-6, 4], [0, 4], [12, 4], [17, 4], [-6, 15], [0, 11], [10, 11], [16, 15], [0, 19], [10, 19], [-6, 26], [5, 26], [16, 26]];
    grid.forEach(([x, z], i) => W('h' + i, x, 0, z, []));
    const L = (a, b) => this.link(a, b);
    L('h_dl', 'h1'); L('h_dr', 'h2'); L('h1', 'h0'); L('h1', 'h5'); L('h2', 'h3'); L('h2', 'h6'); L('h0', 'h4'); L('h3', 'h7'); L('h5', 'h6'); L('h5', 'h8');
    L('h6', 'h9'); L('h4', 'h8'); L('h7', 'h9'); L('h4', 'h10'); L('h8', 'h11'); L('h9', 'h11'); L('h7', 'h12'); L('h11', 'h12'); L('h10', 'h11'); L('h_dl', 'h_dr'); L('h5', 'h4');
    [[8, 'h0'], [16, 'h4'], [24, 'h10']].forEach(([z, h], i) => { W('ld' + i, -8.5, 0, z, [h]); W('li' + i, -12, 0, z, ['ld' + i]); W('lb' + i, -15.5, 0, z + 1.5, ['li' + i]); });
    // elevated spots bots can climb to
    W('t1', 3.6, 3.0, 12.6, ['h5'], true); W('cw1', -8, 3.0, 0.6, ['h0'], true); W('cw2', 18.4, 3.0, 15, ['h7'], true); W('cw3', 5, 3.0, 29.4, ['h11'], true);
    W('cr1', -6, 2.0, 4, ['h0'], true); W('cr2', 16, 3.0, 24, ['h12'], true);
  }
  randomWaypoint(r = Math.random, groundOnly = false) { const list = groundOnly ? this.waypoints.filter(w => !w.climb) : this.waypoints; return list[Math.floor(r() * list.length)]; }
  nearestWaypoint(p, groundOnly = true) { let best = null, bd = 1e9; for (const w of this.waypoints) { if (groundOnly && w.climb) continue; const d = w.pos.distanceToSquared(p); if (d < bd) { bd = d; best = w; } } return best; }
  path(from, to) { // BFS
    const prev = new Map([[from, null]]); const q = [from];
    while (q.length) { const c = q.shift(); if (c === to) break; for (const n of c.links) if (!prev.has(n)) { prev.set(n, c); q.push(n); } }
    if (!prev.has(to)) return [to];
    const out = []; for (let c = to; c; c = prev.get(c)) out.unshift(c); return out;
  }
  randomAmbientPos() { return new THREE.Vector3(-10 + Math.random() * 30, 1 + Math.random() * 10, Math.random() * 30); }

  // ---- per-frame world animation -------------------------------------------------------------
  update(dt, t, hands) {
    for (const L of this.lights) {
      if (L.emergency) { L.t += dt; const k = 0.55 + 0.45 * Math.sin(L.t * Math.PI); if (L.mat) L.mat.emissiveIntensity = 1 + 3 * k; L.glow.material.opacity = 0.25 + 0.55 * k; continue; }
      let level = 1;
      if (!L.steady) {
        L.timer -= dt;
        if (L.timer <= 0) { const r = Math.random(); L.pattern = r < 0.45 ? 'steady' : r < 0.75 ? 'double' : r < 0.9 ? 'buzzoff' : 'flutter'; L.pt = 0; L.timer = L.pattern === 'steady' ? 3 + Math.random() * 6 : 1.2 + Math.random(); }
        L.pt = (L.pt || 0) + dt;
        if (L.pattern === 'double') level = (L.pt < 0.06 || (L.pt > 0.14 && L.pt < 0.2)) ? 0.05 : 1;
        else if (L.pattern === 'buzzoff') level = L.pt < 0.8 ? 0.05 : 1;
        else if (L.pattern === 'flutter') level = Math.random() < 0.5 ? 0.15 : 1;
      }
      if (level !== L.level) { for (const m of L.mats) m.emissiveIntensity = 3 * level; L.pool.visible = level > 0.5; L.level = level; }
    }
    // chains: damped pendulums, pushed by hands that touch them
    for (const c of this.chains) {
      const g = 9.8 / c.len;
      c.vx += (-g * Math.sin(c.ax)) * dt; c.vz += (-g * Math.sin(c.az)) * dt; c.vx *= 0.995; c.vz *= 0.995;
      c.ax += c.vx * dt; c.az += c.vz * dt;
      c.pivot.rotation.set(c.ax, 0, c.az);
      c.tip.set(0, -c.len, 0).applyEuler(c.pivot.rotation).add(c.pivot.position);
      if (hands) for (const h of hands) {
        if (!h || !h.pos) continue;
        const d2 = distToSegment2(h.pos, c.pivot.position, c.tip);
        if (d2 < 0.2 * 0.2 && h.vel) { c.vx += -h.vel.z * dt * 1.5; c.vz += h.vel.x * dt * 1.5; }
      }
      const lo = c.tip, mid = new THREE.Vector3().lerpVectors(c.pivot.position, c.tip, 0.5);
      c.box.min.set(Math.min(lo.x, mid.x) - 0.06, lo.y - 0.1, Math.min(lo.z, mid.z) - 0.06); c.box.max.set(Math.max(lo.x, mid.x) + 0.06, mid.y, Math.max(lo.z, mid.z) + 0.06);
      c.box.vel.subVectors(c.tip, c.prevTip).divideScalar(Math.max(dt, 1e-4)); c.prevTip.copy(c.tip);
    }
    // vent grates swing open when pushed, close again after a while
    for (const gr of this.grates) {
      if (hands) for (const h of hands) if (h && h.pos && h.pos.distanceTo(gr.center) < 0.42) { gr.target = 1.45; gr.openTimer = 4; }
      gr.openTimer -= dt; if (gr.openTimer <= 0) gr.target = 0;
      gr.angle += (gr.target - gr.angle) * Math.min(1, dt * 6);
      gr.pivot.children[0].rotation.x = -gr.angle;
      gr.box.enabled = gr.angle < 0.5;
    }
  }
}
function distToSegment2(p, a, b) {
  const ab = new THREE.Vector3().subVectors(b, a), ap = new THREE.Vector3().subVectors(p, a);
  const t = Math.max(0, Math.min(1, ap.dot(ab) / ab.lengthSq()));
  return a.clone().addScaledVector(ab, t).distanceToSquared(p);
}
