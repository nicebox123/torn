// TORN - Locomotion: a line-by-line JavaScript port of GorillaLocomotion (Player.cs + Surface.cs).
//
//   Original: https://github.com/Another-Axiom/GorillaLocomotion
//   MIT License — Copyright (c) 2021 Another-Axiom
//   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
//   documentation files (the "Software"), to deal in the Software without restriction, including without limitation
//   the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
//   permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright
//   notice and this permission notice shall be included in all copies or substantial portions of the Software.
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
//   WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
//   COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
//   OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//
// What changed in the port (Unity -> three.js), and the TORN hooks added on top:
//   * Physics.SphereCast / Physics.Raycast -> World.sphereCast / World.raycast (the map is made of boxes).
//   * Rigidbody (gravity + body/head colliders) -> our own velocity integration + body & head sphere push-out,
//     run first each frame like Unity's FixedUpdate-before-Update order.
//   * Surface.slipPercentage -> the collider box's surface tag (CONFIG.SURFACES[x].slip) + blood/goo pools.
//   * Missing arm: that hand is skipped entirely and launch power is x0.8 (CONFIG.ONE_ARM_LAUNCH). No arms: no pushing.
//   * Surfaces: bouncy/sticky change the jump multiplier; climbable surfaces never slide.
//   * Monsters: speedMult scales jumpMultiplier and maxJumpSpeed. Stunned = hands pass through, no pushing.
//   * Moving surfaces (swinging chains) carry the stuck hand with them.  Wall crawl = no gravity.
//   * onSlap event when a hand first touches something (sounds, particles, handprints, haptics).
//   Everything else (sticking, sliding, 2-hand averaging, head check, velocity history, jump, unstick) is unchanged.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const V = () => new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

export class Locomotion {
  constructor(world, rig) {
    this.world = world; this.rig = rig;     // rig = the play-space root ("transform" in Player.cs)
    // ---- public settings (same names/defaults as Player.cs)
    this.velocityHistorySize = CONFIG.VELOCITY_HISTORY;
    this.maxArmLength = 1.5;
    this.unStickDistance = 1;
    this.velocityLimit = CONFIG.VELOCITY_LIMIT;
    this.maxJumpSpeed = CONFIG.MAX_JUMP_SPEED;
    this.jumpMultiplier = CONFIG.JUMP_MULTIPLIER;
    this.minimumRaycastDistance = CONFIG.HAND_RADIUS;   // hand sphere radius
    this.defaultSlideFactor = 0.03;
    this.defaultPrecision = 0.995;
    this.headRadius = CONFIG.HEAD_RADIUS;
    this.disableMovement = false;
    // ---- TORN hooks
    this.bodyRadius = CONFIG.BODY_RADIUS; this.bodyOffset = CONFIG.BODY_OFFSET;
    this.speedMult = 1; this.stunned = 0; this.disabled = false; this.wallCrawl = false; this.onSlap = null;
    // ---- state
    this.velocity = V();                                 // playerRigidBody.velocity
    this.lastHand = [V(), V()]; this.lastHead = V(); this.lastPosition = V();
    this.wasTouching = [false, false];
    this.velocityHistory = []; this.velocityIndex = 0; this.denormalizedVelocityAverage = V();
    this.handSurface = ['metal', 'metal']; this.handBox = [null, null];
    this.initialized = false; this.grounded = false;
  }
  // read-only views used by the rest of the game
  get handPos() { return this.lastHand; }
  get touching() { return this.wasTouching; }
  get surface() { return this.handSurface; }

  teleport() { this.initialized = false; this.velocity.set(0, 0, 0); }
  addVelocity(v) { this.velocity.add(v); }
  // Player.Turn(): rotate the stored velocities with the play space
  turn(radians) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), radians);
    this.denormalizedVelocityAverage.applyQuaternion(q);
    for (const v of this.velocityHistory) v.applyQuaternion(q);
  }
  initializeValues(head, hands) {
    this.velocityHistory = Array.from({ length: this.velocityHistorySize }, V);
    this.velocityIndex = 0; this.denormalizedVelocityAverage.set(0, 0, 0);
    this.lastHand[0].copy(hands[0]); this.lastHand[1].copy(hands[1]); this.lastHead.copy(head);
    this.lastPosition.copy(this.rig.position); this.wasTouching = [false, false];
    this.initialized = true;
  }

  // head: world head position, targets: world hand positions (controller + offset, arm-scaled), active: arm present
  update(dt, { head, targets, active }) {
    dt = Math.min(Math.max(dt, 1e-4), 1 / 30);
    const rig0 = this.rig.position.clone();
    this.rigidbodyStep(dt, head, rig0);                                   // Unity runs physics before Update
    const off = () => V().subVectors(this.rig.position, rig0);      // how far the play space moved this frame
    const headNow = () => head.clone().add(off());
    const current = (i) => {                                        // CurrentLeft/RightHandPosition()
      const h = headNow(), p = targets[i].clone().add(off());
      const d = V().subVectors(p, h);
      return d.length() < this.maxArmLength ? p : h.addScaledVector(d.normalize(), this.maxArmLength);
    };
    if (!this.initialized) this.initializeValues(headNow(), [current(0), current(1)]);
    const pushing = !this.disabled && this.stunned <= 0;
    const use = [active[0] && pushing, active[1] && pushing];
    const colliding = [false, false];
    const firstIteration = [V(), V()];
    const gravityStep = DOWN.clone().multiplyScalar(2 * 9.8 * dt * dt);

    // ---- each hand: does moving from last position to current position hit something?
    for (let i = 0; i < 2; i++) {
      if (!use[i]) continue;
      if (this.wasTouching[i] && this.handBox[i] && this.handBox[i].vel) this.lastHand[i].addScaledVector(this.handBox[i].vel, dt); // swinging chain
      const travelled = current(i).sub(this.lastHand[i]).add(gravityStep);
      const r = this.iterativeCollisionSphereCast(this.lastHand[i], this.minimumRaycastDistance, travelled, this.defaultPrecision, true);
      if (r.hit) {
        // this lets you stick to the position you touch, as long as you keep touching the surface this will be the zero point for that hand
        firstIteration[i] = this.wasTouching[i] ? V().subVectors(this.lastHand[i], current(i)) : V().subVectors(r.end, current(i));
        this.velocity.set(0, 0, 0);
        colliding[i] = true;
        if (r.surface) { this.handSurface[i] = r.surface; this.handBox[i] = r.box; }
      }
    }
    // ---- average or add
    const both = (colliding[0] || this.wasTouching[0]) && (colliding[1] || this.wasTouching[1]);
    let rigidBodyMovement = both ? firstIteration[0].clone().add(firstIteration[1]).divideScalar(2) : firstIteration[0].clone().add(firstIteration[1]);

    // ---- check valid head movement
    const hn = headNow();
    const hr = this.iterativeCollisionSphereCast(this.lastHead, this.headRadius, hn.clone().add(rigidBodyMovement).sub(this.lastHead), this.defaultPrecision, false);
    if (hr.hit) {
      rigidBodyMovement = V().subVectors(hr.end, this.lastHead);
      // last check to make sure the head won't phase through geometry
      const d = hn.clone().sub(this.lastHead).add(rigidBodyMovement);
      if (d.lengthSq() > 1e-12 && this.world.raycast(this.lastHead, d.clone().normalize(), d.length() + this.headRadius * this.defaultPrecision * 0.999)) {
        rigidBodyMovement = V().subVectors(this.lastHead, hn);
      }
    }
    if (rigidBodyMovement.lengthSq() > 0) this.rig.position.add(rigidBodyMovement);
    this.lastHead.copy(headNow());

    // ---- final hand positions
    for (let i = 0; i < 2; i++) {
      if (!use[i]) { this.lastHand[i].copy(current(i)); colliding[i] = false; continue; }
      const travelled = current(i).sub(this.lastHand[i]);
      const r = this.iterativeCollisionSphereCast(this.lastHand[i], this.minimumRaycastDistance, travelled, this.defaultPrecision, !both);
      if (r.hit) { this.lastHand[i].copy(r.end); colliding[i] = true; if (r.surface) { this.handSurface[i] = r.surface; this.handBox[i] = r.box; } }
      else this.lastHand[i].copy(current(i));
    }
    this.storeVelocities(dt);

    if ((colliding[0] || colliding[1]) && !this.disableMovement && !this.disabled) {
      const avg = this.denormalizedVelocityAverage;
      if (avg.length() > this.velocityLimit) {
        const surf = CONFIG.SURFACES[this.handSurface[colliding[0] ? 0 : 1]] || {};
        const arms = (active[0] ? 1 : 0) + (active[1] ? 1 : 0);
        const j = Math.min(1, surf.jump || 1);   // slippery/sticky weaken the launch; bouncy is a release boost below
        const mult = this.jumpMultiplier * j * this.speedMult * (arms === 1 ? CONFIG.ONE_ARM_LAUNCH : 1);
        const max = this.maxJumpSpeed * this.speedMult;
        if (avg.length() * mult > max) this.velocity.copy(avg).normalize().multiplyScalar(max);
        else this.velocity.copy(avg).multiplyScalar(mult);
      }
    }
    // ---- check to see if a hand is stuck and we should unstick it
    for (let i = 0; i < 2; i++) {
      if (!colliding[i]) continue;
      const c = current(i), h = headNow();
      if (c.distanceTo(this.lastHand[i]) > this.unStickDistance) {
        const d = V().subVectors(c, h);
        const blocked = this.world.sphereCast(h, this.minimumRaycastDistance * this.defaultPrecision, d.clone().normalize(), d.length() - this.minimumRaycastDistance);
        if (!blocked) { this.lastHand[i].copy(c); colliding[i] = false; }
      }
    }
    // TORN: slap event on first contact
    for (let i = 0; i < 2; i++) if (colliding[i] && !this.wasTouching[i] && this.onSlap) {
      const strength = this.prevSpeed ? this.prevSpeed[i] : 1;
      this.onSlap(i, this.lastHand[i].clone(), this.handSurface[i], strength);
    }
    this.prevSpeed = [0, 1].map(i => targets[i].distanceTo(this._prevT?.[i] || targets[i]) / dt);
    this._prevT = [targets[0].clone(), targets[1].clone()];
    // TORN: bouncy surfaces (body bags) fling you harder the moment you let go
    if ((this.wasTouching[0] || this.wasTouching[1]) && !colliding[0] && !colliding[1]) {
      const last = this.handSurface[this.wasTouching[0] ? 0 : 1];
      const j = CONFIG.SURFACES[last]?.jump || 1;
      if (j > 1 && this.velocity.length() > this.velocityLimit) { this.velocity.multiplyScalar(j); if (this.velocity.length() > this.maxJumpSpeed * 1.8) this.velocity.setLength(this.maxJumpSpeed * 1.8); }
    }
    this.wasTouching = colliding;
    if (this.stunned > 0) this.stunned -= dt;
  }

  // Unity Rigidbody stand-in: gravity, velocity, body + head colliders against the world
  rigidbodyStep(dt, head, rig0) {
    if (this.wallCrawl) this.velocity.multiplyScalar(Math.pow(0.05, dt)); else this.velocity.y += CONFIG.GRAVITY * dt;
    this.rig.position.addScaledVector(this.velocity, dt);
    this.grounded = false;
    for (const [offset, radius] of [[this.bodyOffset, this.bodyRadius], [0, this.headRadius]]) {
      const c = head.clone().add(V().subVectors(this.rig.position, rig0)).sub(new THREE.Vector3(0, offset, 0));
      const before = c.clone();
      const hit = this.world.resolveSphere(c, radius, null, 3);
      if (!hit) continue;
      this.rig.position.add(c.sub(before));
      const vn = this.velocity.dot(hit.normal); if (vn < 0) this.velocity.addScaledVector(hit.normal, -vn);
      if (hit.normal.y > 0.6) { this.grounded = true; const f = Math.pow(0.02, dt); this.velocity.x *= f; this.velocity.z *= f; }
    }
    this.world.clampBounds(this.rig.position);
  }

  storeVelocities(dt) {
    const N = this.velocityHistorySize;
    this.velocityIndex = (this.velocityIndex + 1) % N;
    const oldest = this.velocityHistory[this.velocityIndex];
    const current = V().subVectors(this.rig.position, this.lastPosition).divideScalar(dt);
    this.denormalizedVelocityAverage.add(V().subVectors(current, oldest).divideScalar(N));
    this.velocityHistory[this.velocityIndex] = current;
    this.lastPosition.copy(this.rig.position);
  }

  iterativeCollisionSphereCast(start, radius, movement, precision, singleHand) {
    const first = this.collisionsSphereCast(start, radius * precision, movement, precision);
    if (first.hit) {
      // slide a bit along the surface: two-handed grabs don't stick 100%, and braced pushes let the hand slide
      const firstPosition = first.final.clone();
      const surf = first.box ? this.world.surfaceOverride(first.final, first.box.surface) : 'metal';
      const S = CONFIG.SURFACES[surf] || {};
      const slip = S.slip > 0 ? S.slip : surf === 'climb' ? 0 : (!singleHand ? this.defaultSlideFactor : 0.001);
      const target = start.clone().add(movement);
      const slide = V().subVectors(target, firstPosition).projectOnPlane(first.normal).multiplyScalar(slip);
      const out = { hit: true, surface: surf, box: first.box, end: firstPosition };
      const s1 = this.collisionsSphereCast(firstPosition, radius, slide, precision * precision);
      if (s1.hit) { out.end = s1.final; return out; }
      const from = slide.clone().add(firstPosition);
      const s2 = this.collisionsSphereCast(from, radius, V().subVectors(target, from), precision * precision * precision);
      if (s2.hit) { out.end = s2.final; return out; }
      out.end = firstPosition; return out;
    }
    // sanity check with a smaller sphere (in case we started already touching)
    const L = movement.length();
    if (L > 1e-9) {
      const small = this.collisionsSphereCast(start, radius * precision * 0.66, movement.clone().normalize().multiplyScalar(L + radius * precision * 0.34), precision * 0.66);
      if (small.hit) return { hit: true, end: start.clone(), surface: small.box ? this.world.surfaceOverride(start, small.box.surface) : null, box: small.box };
    }
    return { hit: false, end: V() };
  }

  collisionsSphereCast(start, radius, movement, precision) {
    const L = movement.length();
    if (L < 1e-9) return { hit: false };
    const dir = movement.clone().divideScalar(L);
    const W = this.world;
    const h = W.sphereCast(start, radius * precision, dir, L + radius * (1 - precision));
    if (h) {
      // aim for a spot one radius off the surface along the hit normal
      let final = h.point.clone().addScaledVector(h.normal, radius);
      let info = h;
      const d = V().subVectors(final, start); const dl = d.length();
      if (dl > 1e-9) {
        const dd = d.clone().divideScalar(dl);
        const inner = W.sphereCast(start, radius * precision * precision, dd, dl + radius * (1 - precision * precision));
        if (inner) { final = start.clone().addScaledVector(dd, Math.max(0, h.distance - radius * (1 - precision * precision))); info = inner; }
        else { const ray = W.raycast(start, dd, dl + radius * precision * precision * 0.999); if (ray) return { hit: true, final: start.clone(), normal: ray.normal, box: ray.box }; }
      }
      return { hit: true, final, normal: info.normal, box: info.box };
    }
    const ray = W.raycast(start, dir, L + radius * precision * 0.999);   // anti-clipping check
    if (ray) return { hit: true, final: start.clone(), normal: ray.normal, box: ray.box };
    return { hit: false };
  }
}
