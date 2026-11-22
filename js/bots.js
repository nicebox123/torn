// TORN - BotAI. Bots use the same Creature rig. They move with GT-style hops: hands plant on the ground,
// the body vaults forward, hands swing ahead. Survivor bots wander/climb/flee/hide/struggle.
// Monster bots chase the nearest visible survivor, use abilities in range, and use all 3 tear types.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { MONSTER_RIGS } from './rig.js';
import { rng } from './network.js';

const UP = new THREE.Vector3(0, 1, 0);
const DIFF = { EASY: { speed: 0.8, react: 0.6, pull: 0.35, struggle: 0.45, see: 10 }, NORMAL: { speed: 1, react: 0.9, pull: 0.55, struggle: 0.75, see: 14 }, HARD: { speed: 1.15, react: 1.2, pull: 0.8, struggle: 1.05, see: 18 } };

export class Bot {
  constructor(game, creature, seed) {
    this.game = game; this.c = creature; this.r = rng(seed); creature.isBot = true; creature.bot = this;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.face = new THREE.Vector3(0, 0, 1);
    this.ground = false; this.stride = 0; this.path = []; this.idle = 0; this.state = 'wander'; this.stun = 0;
    this.plant = [new THREE.Vector3(), new THREE.Vector3()]; this.planted = [false, false]; this.nextHand = 0;
    this.target = null; this.lastSeen = -99; this.losTimer = 0; this.abilityCD = 5; this.crawl = 0; this.tearPlan = null; this.held = null; this.holdTimer = 0;
    this.blind = 0; this.hideTimer = 0; this.followPlayer = 0;
  }
  get diff() { return DIFF[this.game.save.data.botDifficulty] || DIFF.NORMAL; }
  spawnAt(p) { this.pos.copy(p); this.pos.y = Math.max(p.y, 0) + this.c.radius + 0.02; this.vel.set(0, 0, 0); this.path = []; for (let i = 0; i < 2; i++) this.planted[i] = false; }
  eyeOffset() { if (this.c.monster) { const R = MONSTER_RIGS[this.c.monster]; return new THREE.Vector3(0, R.eye[1] - 0.05, 0).addScaledVector(this.face, R.eye[2]); } return new THREE.Vector3(0, CONFIG.BODY_OFFSET, 0).addScaledVector(this.face, 0.02); }
  // ------------------------------------------------------------------ brain
  think(dt) {
    const G = this.game, c = this.c, map = G.map;
    if (!c.alive || c.respawning) return { dir: null };
    if (c.ghost) { this.wanderGhost(dt); return { dir: null }; }
    if (this.stun > 0) { this.stun -= dt; return { dir: null }; }
    if (c.grabbedBy) { c.struggle = (c.struggle || 0) + dt * this.diff.struggle * (this.r() < 0.7 ? 1 : 0); return { dir: null, shake: true }; }
    if (!c.monster && !c.armsPresent[0] && !c.armsPresent[1]) return { dir: null };   // armless: can only wobble
    if (c.monster) return this.thinkMonster(dt);
    // survivor
    const mon = this.nearestMonster();
    if (mon && mon.d < 9 * this.diff.react + 3) {
      this.state = 'flee'; this.hideTimer = 0;
      if (!this.path.length || this.repath <= 0) {
        this.repath = 1.2;
        const here = map.nearestWaypoint(this.pos);
        let best = null, bd = -1;
        for (const w of [here, ...here.links, ...here.links.flatMap(l => l.links)]) { const d = w.pos.distanceTo(mon.c.bodyCenter()) + this.r() * 3; if (d > bd) { bd = d; best = w; } }
        this.path = map.path(here, best);
      }
      this.repath -= dt;
    } else if (this.state === 'flee') { this.state = this.r() < 0.35 ? 'hide' : 'wander'; this.hideTimer = 4 + this.r() * 6; this.path = []; }
    if (this.state === 'hide') { this.hideTimer -= dt; if (this.hideTimer <= 0) this.state = 'wander'; return { dir: null }; }
    if (this.state === 'wander') {
      if (G.modes.mode === 'CASUAL' && G.player && this.followPlayer > 0) { this.followPlayer -= dt; const p = G.player.creature.headPos; if (p.distanceTo(this.pos) > 2.5) return { dir: p.clone().sub(this.pos).setY(0).normalize(), speed: 0.7, look: p }; return { dir: null, look: p }; }
      if (!this.path.length) {
        if (this.idle > 0) { this.idle -= dt; return { dir: null }; }
        if (G.modes.mode === 'CASUAL' && this.r() < 0.15) { this.followPlayer = 8 + this.r() * 10; return { dir: null }; }
        const here = map.nearestWaypoint(this.pos); const goal = map.randomWaypoint(this.r);
        this.path = map.path(here, goal); this.idle = 1 + this.r() * 3;
      }
    }
    return this.followPath(dt, this.state === 'flee' ? 1.25 : 0.75);
  }
  followPath(dt, speed) {
    while (this.path.length) {
      const w = this.path[0]; const flat = w.pos.clone().sub(this.pos); const dy = w.pos.y - (this.pos.y - this.c.radius); flat.y = 0;
      if (flat.length() < 0.7 && dy < 0.6) { this.path.shift(); continue; }
      return { dir: flat.normalize(), speed, climb: dy > 0.5 ? w.pos : null, look: w.pos };
    }
    return { dir: null };
  }
  wanderGhost(dt) { if (!this.path.length) this.path = [this.game.map.randomWaypoint(this.r)]; const w = this.path[0]; const d = w.pos.clone().add(new THREE.Vector3(0, 2.5, 0)).sub(this.pos); if (d.length() < 0.5) this.path = []; else this.pos.addScaledVector(d.normalize(), dt * 1.5); this.face.copy(d.setY(0).normalize()); }
  nearestMonster() { let best = null; for (const o of this.game.creatures) { if (o === this.c || !o.monster || !o.alive) continue; const d = o.bodyCenter().distanceTo(this.pos); if (d < (best?.d ?? 1e9)) best = { c: o, d }; } return best; }
  visibleSurvivors() {
    const G = this.game, out = [];
    for (const o of G.creatures) {
      if (o === this.c || !o.canTear || o.respawning) continue;
      const p = o.bodyCenter(); const d = p.distanceTo(this.pos);
      if (d > this.diff.see) continue;
      if (G.world.lineOfSight(this.c.headPos, o.headPos) || (d < 3 && G.world.lineOfSight(this.c.headPos, p))) out.push({ c: o, d, p });
    }
    return out.sort((a, b) => a.d - b.d);
  }
  thinkMonster(dt) {
    const G = this.game, c = this.c;
    if (this.blind > 0) { this.blind -= dt; return { dir: null }; }
    c.chasing = false;
    // holding a torn part: wave it around, then throw it
    if (this.held) { this.holdTimer -= dt; if (this.holdTimer <= 0) { const v = this.face.clone().multiplyScalar(5).add(new THREE.Vector3((this.r() - .5) * 2, 3, (this.r() - .5) * 2)); G.phys.release(this.held.node, v); this.held = null; } }
    this.losTimer -= dt;
    if (this.losTimer <= 0) { this.losTimer = 0.3 / this.diff.react; const vis = this.visibleSurvivors(); if (vis.length) { this.target = vis[0].c; this.lastSeen = G.time; } }
    if (this.target && (G.time - this.lastSeen > 5 || !this.target.canTear)) { this.target = null; this.tearPlan = null; G.tear.releaseAll(c); }
    this.abilityCD -= dt; if (this.crawl > 0) { this.crawl -= dt; c.anim.crawl = this.crawl; }
    if (!this.target) return this.wanderMonster(dt);
    c.chasing = true;
    const tp = this.target.bodyCenter(); const to = tp.clone().sub(this.pos); const d = to.length();
    // abilities in range
    if (this.abilityCD <= 0) {
      const t = c.monster;
      if (t === 'BUTCHER' && d < 3.5) { G.ability(c, 'ROAR'); this.abilityCD = CONFIG.MONSTERS.BUTCHER.cooldown; }
      else if (t === 'STITCHFACE' && (tp.y - this.pos.y > 1.2 || d > 6)) { G.ability(c, 'CRAWL'); this.crawl = 6; this.abilityCD = CONFIG.MONSTERS.STITCHFACE.cooldown; }
      else if (t === 'CRAWLER' && d > 3 && d < 7) { G.ability(c, 'POUNCE'); this.vel.addScaledVector(to.clone().setY(0).normalize(), 7).add(new THREE.Vector3(0, 3, 0)); this.abilityCD = CONFIG.MONSTERS.CRAWLER.cooldown; }
    }
    if (d < 1.25 + c.radius) return this.doTear(dt, tp);
    this.tearPlan = null;
    if (d > 6 || !G.world.lineOfSight(this.pos, tp)) {
      if (!this.path.length || (this.repath -= dt) <= 0) { this.repath = 1; this.path = G.map.path(G.map.nearestWaypoint(this.pos), G.map.nearestWaypoint(tp, false)); }
      const r = this.followPath(dt, 1.1); if (r.dir) return r;
    }
    return { dir: to.clone().setY(0).normalize(), speed: 1.15, climb: tp.y - this.pos.y > 0.6 ? tp : null, look: tp };
  }
  wanderMonster(dt) {
    if (!this.path.length) { this.path = this.game.map.path(this.game.map.nearestWaypoint(this.pos), this.game.map.randomWaypoint(this.r, true)); }
    return this.followPath(dt, 0.8);
  }
  doTear(dt, tp) {
    const G = this.game, c = this.c, v = this.target, st = G.tear.state(c);
    if (!this.tearPlan) {
      const arms = v.armsPresent; const r = this.r();
      let type = r < 0.45 ? 'arm' : r < 0.75 ? 'head' : 'split';
      if (type === 'arm' && !arms[0] && !arms[1]) type = 'head';
      const side = arms[0] && arms[1] ? (this.r() < 0.5 ? 0 : 1) : arms[0] ? 0 : 1;
      const parts = type === 'arm' ? ['torso' + (side === 0 ? 'R' : 'L'), side === 0 ? 'armL' : 'armR'] : type === 'head' ? ['torso' + (this.r() < 0.5 ? 'L' : 'R'), 'head'] : ['torsoL', 'torsoR'];
      this.tearPlan = { type, parts, pull: 0, t: 0 };
    }
    const P = this.tearPlan; P.t += dt;
    if (P.t > 6) { this.tearPlan = null; G.tear.releaseAll(c); return { dir: null, look: tp }; }
    const targets = v.grabTargets();
    const hands = [];
    for (let i = 0; i < 2; i++) {
      const want = P.parts[i]; const cand = targets.filter(t => t.part === want);
      if (!cand.length) { this.tearPlan = null; G.tear.releaseAll(c); return { dir: null }; }
      const tgt = cand[cand.length - 1].pos;
      if (!st.hands[i]) { hands[i] = tgt; if (c.handWorld[i].distanceTo(tgt) < 0.12) G.tear.tryGrab(c, i); }
      else hands[i] = null;
    }
    if (st.hands[0] && st.hands[1]) {   // both grabbed: pull apart
      P.pull += dt * this.diff.pull * CONFIG.MONSTERS[c.monster].tear;
      const mid = c.handWorld[0].clone().lerp(c.handWorld[1], 0.5);
      const axis = P.type === 'head' ? UP.clone() : c.handWorld[1].clone().sub(c.handWorld[0]).normalize();
      if (P.type === 'head') { hands[0] = v.bodyCenter().add(new THREE.Vector3(0, -P.pull * 0.5, 0)); hands[1] = v.bodyCenter().add(new THREE.Vector3(0, 0.3 + P.pull, 0)); }
      else { hands[0] = mid.clone().addScaledVector(axis, -0.15 - P.pull * 0.5); hands[1] = mid.clone().addScaledVector(axis, 0.15 + P.pull * 0.5); }
    }
    this.handOverride = hands;
    return { dir: null, look: tp };
  }
  // ------------------------------------------------------------------ body sim + animation
  update(dt) {
    const G = this.game, c = this.c;
    if (!c.alive && !c.ghost) { this.pose(dt, null); return; }
    this.handOverride = null;
    const plan = this.think(dt);
    const isM = !!c.monster;
    const speedMult = (isM ? CONFIG.MONSTERS[c.monster].speed : 1) * this.diff.speed;
    if (c.ghost) { this.pose(dt, plan); return; }
    if (plan.dir) this.face.lerp(plan.dir, Math.min(1, dt * 6)).normalize();
    else if (plan.look) { const l = plan.look.clone().sub(this.pos).setY(0); if (l.lengthSq() > 0.01) this.face.lerp(l.normalize(), Math.min(1, dt * 4)).normalize(); }
    // hopping locomotion
    this.stride -= dt;
    if (this.ground && plan.dir && this.stride <= 0 && this.stun <= 0) {
      const sp = 3.3 * (plan.speed || 1) * speedMult;
      this.vel.x = plan.dir.x * sp; this.vel.z = plan.dir.z * sp; this.vel.y = (isM ? 1.6 : 2.2) + this.r() * 0.6;
      this.stride = isM ? 0.42 : 0.34; this.nextHand = 1 - this.nextHand;
      G.audio?.slap('metal', this.pos.clone().add(new THREE.Vector3(0, -c.radius, 0)), 0.4);
      if (isM) G.audio?.play('thud', this.pos, { volume: 0.7 });
    }
    if (!(this.crawl > 0 && this.wall)) this.vel.y += CONFIG.GRAVITY * dt;
    if (!this.ground && plan.dir) { this.vel.x += plan.dir.x * dt * 2; this.vel.z += plan.dir.z * dt * 2; }
    this.pos.addScaledVector(this.vel, dt);
    const hit = G.world.resolveSphere(this.pos, c.radius, null, 3);
    this.ground = false; this.wall = false;
    if (hit) {
      const vn = this.vel.dot(hit.normal); if (vn < 0) this.vel.addScaledVector(hit.normal, -vn);
      if (hit.normal.y > 0.6) { this.ground = true; const f = Math.pow(hit.surface === 'slip' ? 0.6 : 0.001, dt); this.vel.x *= f; this.vel.z *= f; if (hit.surface === 'bouncy' && Math.abs(vn) > 2) this.vel.y = -vn * 0.8; }
      else { this.wall = true; if (plan.climb || this.crawl > 0) { this.vel.y = Math.max(this.vel.y, 3.2); this.ground = true; } }
    }
    G.world.clampBounds(this.pos);
    this.pose(dt, plan);
  }
  pose(dt, plan) {
    const c = this.c;
    const yaw = Math.atan2(-this.face.x, -this.face.z);
    // camera-style head quaternion (looks along -Z), head = eye position
    const pitch = c.grabbedBy ? 0.3 : (plan && plan.look ? Math.max(-0.5, Math.min(0.5, Math.atan2(plan.look.y + 0.5 - this.pos.y, plan.look.distanceTo(this.pos)))) : 0) * 0.5;
    c.headQuat.setFromEuler(new THREE.Euler(pitch, yaw + Math.PI, 0, 'YXZ'));
    // (creature forward is +Z of model; camera forward -Z: yaw+PI makes the camera look along this.face)
    c.headQuat.setFromEuler(new THREE.Euler(pitch, Math.atan2(this.face.x, this.face.z) + Math.PI, 0, 'YXZ'));
    if (c.alive || c.ghost) c.headPos.copy(this.pos).add(this.eyeOffset());
    const right = new THREE.Vector3().crossVectors(this.face, UP).normalize(); // character's right
    const t = this.game.time;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;     // i=0 left hand -> left = -right
      const sh = c.headPos.clone().add(new THREE.Vector3(0, c.monster ? -0.25 : -0.32, 0)).addScaledVector(right, side * (c.monster ? 0.4 : 0.18));
      let target;
      if (this.handOverride && this.handOverride[i]) target = this.handOverride[i];
      else if (this.held && this.held.i === i) target = sh.clone().addScaledVector(this.face, 0.4).add(new THREE.Vector3(0, 0.3 + Math.sin(t * 8) * 0.15, 0));
      else if (plan && plan.shake) target = sh.clone().addScaledVector(this.face, 0.3).add(new THREE.Vector3(Math.sin(t * 31 + i) * 0.25, Math.cos(t * 27 + i * 2) * 0.25, 0));
      else if (c.ghost) target = sh.clone().addScaledVector(this.face, 0.25).add(new THREE.Vector3(0, -0.2 + Math.sin(t * 2 + i) * 0.05, 0));
      else if (!this.ground) { target = sh.clone().addScaledVector(this.face, 0.45).add(new THREE.Vector3(0, -0.1, 0)); this.planted[i] = false; }
      else {
        // planted-hand walk: keep the hand on the floor until it falls behind, then re-plant ahead
        const foot = this.pos.y - c.radius + 0.05;
        const ahead = sh.clone().addScaledVector(this.face, plan && plan.dir ? 0.45 : 0.15).addScaledVector(right, side * 0.1); ahead.y = foot;
        const rel = this.plant[i].clone().sub(this.pos); rel.y = 0;
        if (!this.planted[i] || rel.dot(this.face) < -0.35 || rel.length() > 0.9 || Math.abs(this.plant[i].y - foot) > 0.3) {
          if (!plan || !plan.dir || this.nextHand === i || !this.planted[i]) { this.plant[i].copy(ahead); this.planted[i] = true; }
        }
        target = this.plant[i].clone();
      }
      c.handTarget[i].lerp(target, Math.min(1, dt * 18));
      // hand orientation: fingers forward-ish, palm down (left hand is mirrored)
      const fwd = c.handTarget[i].clone().sub(sh); fwd.y *= 0.3; if (fwd.lengthSq() < 1e-4) fwd.copy(this.face); fwd.normalize();
      const y = (i === 0 ? UP.clone().negate() : UP.clone()); y.addScaledVector(fwd, -y.dot(fwd)).normalize();
      const z = new THREE.Vector3().crossVectors(fwd, y);
      c.handQuat[i].setFromRotationMatrix(new THREE.Matrix4().makeBasis(fwd, y, z));
      c.grip[i] = !!(this.handOverride && this.game.tear.state(c).hands[i]) || (this.held && this.held.i === i) || (this.planted[i] && this.ground);
    }
  }
}
