// TORN - OrganPhysics: torn parts & organs as floppy verlet bodies (points + distance links) colliding with the world.
//  - rigid parts (head, torso halves, organs) = 3 rigidly linked points that carry a mesh
//  - chains (arms with elbow/wrist, intestines, spine) = points linked in a row, a mesh per link
// Anyone can grab (pin a point to a hand), throw (hand velocity on release) and squeeze (squish + squirt).
import * as THREE from 'three';
import { CONFIG } from './config.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const GRAV = new THREE.Vector3(0, -9.8, 0);

class Node { constructor(p, r) { this.p = p.clone(); this.pp = p.clone(); this.r = r; this.pin = null; this.body = null; this.contact = false; } }

export class PhysBody {
  constructor(kind) { this.kind = kind; this.nodes = []; this.links = []; this.bind = []; this.born = 0; this.owner = null; this.dead = false; this.fade = 1; this.jiggle = 0; this.squeeze = 0; this.info = {}; this.frozen = false; }
  center(out = new THREE.Vector3()) { out.set(0, 0, 0); for (const n of this.nodes) out.add(n.p); return out.divideScalar(this.nodes.length); }
  velocity(out = new THREE.Vector3(), dt = 1 / 72) { out.set(0, 0, 0); for (const n of this.nodes) out.add(_v.subVectors(n.p, n.pp)); return out.divideScalar(this.nodes.length * dt); }
  push(v) { for (const n of this.nodes) n.pp.sub(_v.copy(v).multiplyScalar(1 / 90)); }
}

export class OrganPhysics {
  constructor(game) { this.game = game; this.world = game.world; this.bodies = []; this.acc = 0; this.step = 1 / 90; this.time = 0; }
  // ---- creation -------------------------------------------------------------------------------
  // obj: Object3D already in the scene at its world transform. size: half-extent of the rigid frame. r: collision radius per node.
  addRigid(obj, kind = 'part', { size = 0.05, r = 0.04, center = null, vel = null, spin = 0 } = {}) {
    const b = new PhysBody(kind); b.born = this.time;
    obj.updateMatrixWorld(true);
    const c = center ? center.clone() : obj.getWorldPosition(new THREE.Vector3());
    const q = obj.getWorldQuaternion(new THREE.Quaternion());
    const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(q), ay = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const p0 = c, p1 = c.clone().addScaledVector(ax, size), p2 = c.clone().addScaledVector(ay, size);
    for (const p of [p0, p1, p2]) { const n = new Node(p, r); n.body = b; b.nodes.push(n); }
    this._rigidLinks(b, 0, 1, 2);
    // mesh offset relative to the frame
    const frame = this._frame(b.nodes[0].p, b.nodes[1].p, b.nodes[2].p);
    const inv = frame.clone().invert();
    const local = new THREE.Matrix4().multiplyMatrices(inv, obj.matrixWorld);
    b.bind.push({ obj, mode: 'tri', a: 0, b: 1, c: 2, local, baseScale: obj.scale.clone() });
    if (vel) for (const n of b.nodes) n.pp.copy(n.p).addScaledVector(vel, -1 / 90);
    if (spin) { b.nodes[1].pp.addScaledVector(ay, spin * 0.002); b.nodes[2].pp.addScaledVector(ax, -spin * 0.002); }
    this.bodies.push(b); this.enforce(kind);
    return b;
  }
  // chain: points[] world positions; meshes[] Object3Ds placed between point k and k+1 (model along +X, length modelLen[k])
  addChain(points, meshes, kind = 'part', { r = 0.03, modelLen = [], stiff = 1, minBend = 0.55, vel = null } = {}) {
    const b = new PhysBody(kind); b.born = this.time;
    for (const p of points) { const n = new Node(p, r); n.body = b; b.nodes.push(n); }
    for (let i = 0; i < points.length - 1; i++) b.links.push({ a: b.nodes[i], b: b.nodes[i + 1], len: points[i].distanceTo(points[i + 1]), stiff });
    for (let i = 0; i < points.length - 2; i++) b.links.push({ a: b.nodes[i], b: b.nodes[i + 2], len: points[i].distanceTo(points[i + 2]) * minBend, stiff: 0.5, min: true });
    meshes.forEach((m, i) => { if (m) b.bind.push({ obj: m, mode: 'seg', a: i, b: i + 1, len: modelLen[i] || 0, up: new THREE.Vector3(0, 1, 0), baseScale: m.scale.clone(), center: modelLen[i] === 'center' }); });
    if (vel) for (const n of b.nodes) n.pp.copy(n.p).addScaledVector(vel, -1 / 90);
    this.bodies.push(b); this.enforce(kind);
    return b;
  }
  // attach node a (body A) to node b (body B) with a distance link (e.g. intestine ends to torso halves)
  tie(nodeA, nodeB, len = null, stiff = 0.6) { const l = { a: nodeA, b: nodeB, len: len ?? nodeA.p.distanceTo(nodeB.p), stiff, tie: true }; nodeA.body.links.push(l); return l; }
  _rigidLinks(b, i, j, k) { for (const [x, y] of [[i, j], [j, k], [i, k]]) b.links.push({ a: b.nodes[x], b: b.nodes[y], len: b.nodes[x].p.distanceTo(b.nodes[y].p), stiff: 1 }); }
  _frame(p0, p1, p2) {
    _x.subVectors(p1, p0).normalize(); _y.subVectors(p2, p0); _y.addScaledVector(_x, -_y.dot(_x)).normalize(); _z.crossVectors(_x, _y);
    return new THREE.Matrix4().makeBasis(_x, _y, _z).setPosition(p0);
  }
  // keep within the room limits: 20 loose parts, 30 organs (oldest removed first)
  enforce(kind) {
    const lim = kind === 'organ' ? CONFIG.MAX_ORGANS : kind === 'part' ? CONFIG.MAX_PARTS : 40;
    const list = this.bodies.filter(b => b.kind === kind && !b.dead && !b.fading);
    while (list.length > lim) { const o = list.shift(); o.fading = true; }
  }
  // ---- queries ----------------------------------------------------------------------------------
  nearest(pos, range) {
    let best = null, bd = range * range;
    for (const b of this.bodies) { if (b.dead || b.frozen) continue; for (const n of b.nodes) { const d = n.p.distanceToSquared(pos) - n.r * n.r; if (d < bd) { bd = d; best = { body: b, node: n }; } } }
    return best;
  }
  grab(node, hand) { node.pin = hand; node.body.held = (node.body.held || 0) + 1; node.body.jiggle = 1; }
  release(node, vel) { if (!node.pin) return; node.pin = null; node.body.held = Math.max(0, (node.body.held || 1) - 1); if (vel) { const v = vel.clone(); if (v.length() > 9) v.setLength(9); for (const n of node.body.nodes) n.pp.copy(n.p).addScaledVector(v, -this.step); node.body.thrown = this.time; } }
  removeOwnedBy(owner) { for (const b of this.bodies) if (b.owner === owner) this.kill(b); }
  kill(b) { b.dead = true; for (const bi of b.bind) bi.obj.removeFromParent(); if (b.onRemove) b.onRemove(b); }
  clear() { for (const b of this.bodies) this.kill(b); this.bodies = []; }
  // ---- simulation ---------------------------------------------------------------------------------
  update(dt) {
    this.acc += Math.min(dt, 0.05);
    while (this.acc >= this.step) { this._step(this.step); this.acc -= this.step; this.time += this.step; }
    this._sync(dt);
  }
  _step(h) {
    const gore = this.game.gore;
    for (const b of this.bodies) {
      if (b.dead || b.frozen) continue;
      for (const n of b.nodes) {
        if (n.pin) { n.pp.copy(n.p); n.p.copy(n.pin.pos || n.pin); continue; }
        _v.subVectors(n.p, n.pp).multiplyScalar(n.contact ? 0.985 : 0.998);
        n.pp.copy(n.p); n.p.add(_v).addScaledVector(GRAV, h * h);
      }
    }
    for (let it = 0; it < 4; it++) {
      for (const b of this.bodies) {
        if (b.dead || b.frozen) continue;
        for (const l of b.links) {
          if (l.a.body.dead || l.b.body.dead) continue;
          _v.subVectors(l.b.p, l.a.p); const d = _v.length() || 1e-6;
          if (l.min && d >= l.len) continue;
          const diff = (d - l.len) / d * 0.5 * l.stiff;
          const wa = l.a.pin ? 0 : 1, wb = l.b.pin ? 0 : 1; const sum = wa + wb || 1;
          l.a.p.addScaledVector(_v, diff * 2 * wa / sum); l.b.p.addScaledVector(_v, -diff * 2 * wb / sum);
        }
      }
    }
    // world collisions with friction + bounce; impacts trigger splats, jiggle, thuds
    for (const b of this.bodies) {
      if (b.dead || b.frozen) continue;
      for (const n of b.nodes) {
        if (n.pin) continue;
        _w.copy(n.p);
        const hit = this.world.resolveSphere(n.p, n.r, null, 2);
        n.contact = !!hit;
        if (hit) {
          _v.subVectors(n.p, n.pp);
          const vn = _v.dot(hit.normal); const speed = _v.length() / h;
          const vt = _v.clone().addScaledVector(hit.normal, -vn);
          vt.multiplyScalar(hit.surface === 'slip' ? 0.98 : 0.7);
          const bounce = hit.surface === 'bouncy' ? 0.7 : 0.15;
          _v.copy(vt).addScaledVector(hit.normal, vn < 0 ? -vn * bounce : vn);
          n.pp.copy(n.p).sub(_v);
          if (speed > 1.2 && (!n.lastHit || this.time - n.lastHit > 0.12)) { n.lastHit = this.time; if (b.onImpact) b.onImpact(b, n, speed, hit); }
        }
      }
    }
  }
  _sync(dt) {
    for (const b of this.bodies) {
      if (b.dead) continue;
      if (!b.frozen && this.time - b.born > CONFIG.PART_LIFETIME) b.fading = true;
      if (b.fading) { b.fade -= dt; if (b.fade <= 0) { this.kill(b); continue; } }
      const s = b.fading ? Math.max(0.01, b.fade) : 1;
      // soft-body feel: jiggle on impacts / grabs, squeeze flattens 30% then bounces back
      if (b.jiggle > 0) b.jiggle = Math.max(0, b.jiggle - dt * 2.5);
      if (b.squeeze > 0) b.squeeze = Math.max(0, b.squeeze - dt * 1.2);
      const jig = b.jiggle * 0.13 * Math.sin(this.time * 38);
      const sq = Math.min(1, b.squeeze * 1.5) * 0.3;
      for (const bi of b.bind) {
        const o = bi.obj;
        if (bi.mode === 'tri') {
          const f = this._frame(b.nodes[bi.a].p, b.nodes[bi.b].p, b.nodes[bi.c].p).multiply(bi.local);
          f.decompose(o.position, o.quaternion, o.scale);
          o.scale.multiplyScalar(s);
          if (b.kind === 'organ' || b.info.soft) { o.scale.x *= 1 + jig + sq * 0.6; o.scale.y *= 1 - jig - sq; o.scale.z *= 1 + jig * 0.5 + sq * 0.6; }
        } else {
          const A = b.nodes[bi.a].p, B = b.nodes[bi.b].p;
          _x.subVectors(B, A); const L = _x.length() || 1e-5; _x.divideScalar(L);
          _y.copy(bi.up).addScaledVector(_x, -bi.up.dot(_x)); if (_y.lengthSq() < 1e-6) _y.set(0, 0, 1).addScaledVector(_x, -_x.z); _y.normalize();
          bi.up.copy(_y);
          _z.crossVectors(_x, _y);
          o.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
          if (bi.center) o.position.copy(A).lerp(B, 0.5); else o.position.copy(A);
          o.scale.copy(bi.baseScale).multiplyScalar(s);
          if (bi.len && !bi.center) o.scale.x = bi.baseScale.x * (L / bi.len) * s;
        }
      }
      if (b.onUpdate) b.onUpdate(b, dt);
    }
    if (this.bodies.length > 80) this.bodies = this.bodies.filter(b => !b.dead);
  }
}
