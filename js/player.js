// TORN - the local player: connects controllers -> Locomotion -> PlayerRig, plus grabbing, tearing, squeezing,
// dragging teammates, struggling, monster abilities, turning, comfort vignette, ghost flight and screen effects.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Creature, HAND_OFFSET, MONSTER_RIGS } from './rig.js';
import { Locomotion } from './locomotion.js';

const UP = new THREE.Vector3(0, 1, 0);

export class LocalPlayer {
  constructor(game) {
    this.game = game; const G = game, S = G.save.data;
    this.rig = G.rig; this.camera = G.camera; this.input = G.input;
    this.creature = new Creature(G, { name: S.name, color: S.color, isLocal: true });
    this.creature.applyCosmetics(S.equipped, S.glowColor); this.creature.id = 'player';
    this.loco = new Locomotion(G.world, this.rig);
    this.loco.onSlap = (i, p, surf, strength) => this.onSlap(i, p, surf, strength);
    this.held = [null, null]; this.holders = [{ pos: this.creature.handWorld[0] }, { pos: this.creature.handWorld[1] }]; this.dragging = [null, null];
    this.pulse = 0; this.blindT = 0; this.turnLatch = false; this.crawlT = 0; this.desktopVel = new THREE.Vector3(); this.abilityCD = 0;
    // camera overlays: hurt/blindfold/fade sphere + comfort vignette
    this.overlay = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 1, depthTest: false, depthWrite: false }));
    this.overlay.renderOrder = 1000; this.overlay.visible = false; this.camera.add(this.overlay);
    const vc = document.createElement('canvas'); vc.width = vc.height = 256; const vg = vc.getContext('2d');
    const gr = vg.createRadialGradient(128, 128, 60, 128, 128, 128); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); vg.fillStyle = gr; vg.fillRect(0, 0, 256, 256);
    this.vignette = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(vc), transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.vignette.position.z = -0.12; this.vignette.renderOrder = 999; this.camera.add(this.vignette);
    this.fade = 1;
    // wrist display (left forearm): mode, timer, role, shards
    this.wc = document.createElement('canvas'); this.wc.width = 256; this.wc.height = 128; this.wt = new THREE.CanvasTexture(this.wc); this.wt.colorSpace = THREE.SRGBColorSpace;
    this.wrist = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.06), new THREE.MeshBasicMaterial({ map: this.wt, transparent: true })); G.scene.add(this.wrist); this.wristT = 0;
    this.shakeAmt = 0;
  }
  get c() { return this.creature; }
  spawn(pos, yaw) {
    this.rig.position.copy(pos); this.rig.rotation.y = 0; this.rig.updateMatrixWorld(true);
    // rotate so we face `yaw`, keeping the head where it is
    const head = this.camera.getWorldPosition(new THREE.Vector3());
    const camYaw = new THREE.Euler().setFromQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
    if (this.input.desktop && !this.input.xr) { this.input.yaw = yaw; this.input.desktopUpdateLook(); this.camera.updateMatrixWorld(true); } else this.turn(yaw - camYaw);
    // put the head at pos (+ eye height)
    this.rig.updateMatrixWorld(true);
    const h2 = this.camera.getWorldPosition(new THREE.Vector3());
    this.rig.position.add(new THREE.Vector3(pos.x - h2.x, pos.y + 0.45 - h2.y, pos.z - h2.z));
    this.loco.teleport(); this.desktopVel.set(0, 0, 0);
    if (this.input.desktop) this.input.yaw = yaw;
  }
  turn(a) {
    this.rig.updateMatrixWorld(true);
    const head = this.camera.getWorldPosition(new THREE.Vector3());
    this.rig.position.sub(head).applyAxisAngle(UP, a).add(head); this.rig.rotation.y += a; this.loco?.turn(a);
    this.rig.updateMatrixWorld(true);
  }
  hurtPulse(t) { this.pulse = Math.max(this.pulse, Math.min(1.5, t)); }
  blindfold(s) { this.blindT = s; this.game.toast('BLINDFOLDED... COUNT TO ' + s, '#FF3030'); }
  onRespawn() { this.loco.teleport(); for (let i = 0; i < 2; i++) this.releaseHand(i); }
  knockback(v) { this.loco.addVelocity(v); this.loco.stunned = Math.max(this.loco.stunned, 0.2); this.desktopVel.add(v); }
  dragged(delta, dt, k = 1) { this.rig.position.addScaledVector(delta, Math.min(1, dt * 10) * k); }
  holdBody(i, body) {
    const hp = this.c.handWorld[i]; let best = body.nodes[0], bd = 1e9; for (const n of body.nodes) { const d = n.p.distanceTo(hp); if (d < bd) { bd = d; best = n; } }
    if (this.held[i]) this.game.phys.release(this.held[i]);
    this.game.phys.grab(best, this.holders[i]); this.held[i] = best;
  }
  releaseHand(i) {
    const G = this.game; G.tear.release(this.c, i);
    if (this.held[i]) { G.phys.release(this.held[i], this.input.hands[i].vel.clone().multiplyScalar(1.15)); this.held[i] = null; }
    this.dragging[i] = null;
  }
  onSlap(i, p, surf, strength) {
    const G = this.game; const c = this.c;
    if (strength < 0.4) return;
    const n = G.world.resolveSphere(p.clone(), CONFIG.HAND_RADIUS + 0.01)?.normal || UP;
    G.audio?.slap(surf, p, Math.min(1.5, strength / 3));
    if (c.monster) G.audio?.play('thud', p, { volume: Math.min(1, strength / 3) });
    G.haptic(c, i, Math.min(1, 0.2 + strength * 0.15), 30);
    const col = { slip: '#5a2020', sticky: '#4E6B2E', bouncy: '#8a8a8a' }[surf] || '#6a6a64';
    for (let k = 0; k < 5; k++) G.gore.spawn(p.clone().addScaledVector(n, -0.04), n.clone().multiplyScalar(0.6).add(new THREE.Vector3((Math.random() - .5), Math.random() * 0.5, (Math.random() - .5)).multiplyScalar(0.8)), 0.006, new THREE.Color(col), 'stuff');
    G.gore.handContact('player:' + i, p.clone().addScaledVector(n, -0.005), n);
    if (G.gore.nearPool(p) || surf === 'slip') G.gore.markBloody('player:' + i);
  }
  // ------------------------------------------------------------------ per frame
  update(dt) {
    const G = this.game, c = this.c, I = this.input, S = G.save.data;
    const xr = I.xr;
    if (I.desktop && !xr) I.desktopUpdateLook();
    // turning (right stick)
    if (xr && S.turn !== 'NONE' && !c.ghost) {
      const x = I.hands[1].stick.x;
      if (S.turn === 'SNAP') { if (Math.abs(x) > 0.7 && !this.turnLatch) { this.turnLatch = true; this.turn(-Math.sign(x) * (15 + S.turnSpeed * 8.33) * Math.PI / 180); } if (Math.abs(x) < 0.3) this.turnLatch = false; }
      else if (Math.abs(x) > 0.15) this.turn(-x * (30 + S.turnSpeed * 30) * Math.PI / 180 * dt);
    }
    I.update(dt);
    const head = I.head.pos.clone();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(I.head.quat); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
    // arm-scaled hand targets (long arms)
    const mon = c.monster ? MONSTER_RIGS[c.monster] : null;
    const scale = mon ? mon.reach : (S.seated ? CONFIG.SEATED_REACH_SCALE : CONFIG.ARM_REACH_SCALE);
    const targets = [0, 1].map(i => {
      const sh = head.clone().add(new THREE.Vector3(0, -0.25, 0)).addScaledVector(right, (i === 0 ? -1 : 1) * 0.17);
      return I.desktop && !xr ? I.hands[i].pos.clone() : sh.clone().add(I.hands[i].pos.clone().sub(sh).multiplyScalar(scale));
    });
    const quats = [0, 1].map(i => I.hands[i].quat.clone().multiply(HAND_OFFSET));
    // locomotion settings for this body
    const L = this.loco;
    L.bodyRadius = c.radius; L.bodyOffset = mon ? mon.eye[1] : CONFIG.BODY_OFFSET + S.heightAdjust;
    L.speedMult = mon ? CONFIG.MONSTERS[c.monster].speed : 1;
    L.disabled = !c.alive || c.respawning || this.blindT > 0;
    if (this.crawlT > 0) { this.crawlT -= dt; c.anim.crawl = this.crawlT; } L.wallCrawl = this.crawlT > 0;
    const rig0 = this.rig.position.clone();
    if (c.ghost) this.ghostFly(dt, fwd, right);
    else if (xr || !I.desktop) L.update(dt, { head, targets, active: c.armsPresent });
    else this.desktopMove(dt, fwd, right);
    if (c.alive && c.pounceT > 0) c.pounceT -= dt;
    if (this.pulse > 0.3) this.rig.position.add(new THREE.Vector3((Math.random() - .5), (Math.random() - .5), (Math.random() - .5)).multiplyScalar(0.004 * this.pulse));
    this.rig.updateMatrixWorld(true);
    const delta = this.rig.position.clone().sub(rig0);
    // feed the rig
    c.headPos.copy(this.camera.getWorldPosition(new THREE.Vector3())); c.headQuat.copy(this.camera.getWorldQuaternion(new THREE.Quaternion()));
    for (let i = 0; i < 2; i++) {
      const loco = (xr || !I.desktop) && !c.ghost && c.armsPresent[i];
      c.handTarget[i].copy(loco ? L.handPos[i] : targets[i].clone().add(delta));
      c.handQuat[i].copy(quats[i]); c.grip[i] = I.hands[i].grip;
    }
    // grabbing / tearing / squeezing / dragging
    for (let i = 0; i < 2; i++) {
      const h = I.hands[i];
      if (h.gripDown && c.alive && !c.ghost) this.grab(i);
      if (h.gripUp) this.releaseHand(i);
      if (h.trigDown && this.held[i]) G.tear.squeeze(this.held[i].body, 'player:' + i, c.handWorld[i]);
      const d = this.dragging[i];
      if (d) { if (!d.victim.alive || d.victim.monster) this.dragging[i] = null; else G.dragCreature(d.victim, c.handWorld[i].clone().sub(d.obj.localToWorld(d.local.clone())), dt, 0.6); }
    }
    // struggle: shake hard to break free
    if (c.grabbedBy) {
      const shake = (I.hands[0].vel.length() + I.hands[1].vel.length()) / 2 + (I.desktop && !xr && (I.down('KeyQ') || I.down('KeyE') || I.keys.has('Space')) ? 3 : 0);
      if (shake > CONFIG.TEAR.STRUGGLE_SPEED) { c.struggle += dt; G.haptic(c, 0, 0.3, 20); G.haptic(c, 1, 0.3, 20); } else c.struggle = Math.max(0, c.struggle - dt * 0.3);
    }
    // monster abilities: both triggers (+ throw hands outward for ROAR)
    if (this.abilityCD > 0) this.abilityCD -= dt;
    if (c.monster && c.alive && this.abilityCD <= 0 && I.hands[0].trigger && I.hands[1].trigger && (I.hands[0].trigDown || I.hands[1].trigDown || (I.desktop && !xr && I.down('KeyR')))) {
      const type = CONFIG.MONSTERS[c.monster].ability;
      const apart = I.hands[0].vel.clone().sub(I.hands[1].vel).dot(I.hands[0].pos.clone().sub(I.hands[1].pos).normalize());
      if (type !== 'ROAR' || apart > 1.2 || (I.desktop && !xr)) { G.ability(c, type); this.abilityCD = CONFIG.MONSTERS[c.monster].cooldown; }
    }
    // talk (mic) -> jaw
    if (G.micLevel !== undefined) { const ptt = S.mic === 'PUSH TO TALK' ? (I.hands[0].b || I.hands[1].b) : S.mic === 'ALL CHAT'; c.anim.talk = ptt ? G.micLevel() * 6 : 0; }
    // screen effects: hurt pulse, blindfold, downed, fade-in, vignette
    this.pulse = Math.max(0, this.pulse - dt * 1.2);
    this.fade = Math.max(0, this.fade - dt * 1.5);
    const om = this.overlay.material;
    if (this.blindT > 0) { this.blindT -= dt; om.color.set(0x000000); om.opacity = 1; }
    else if (this.fade > 0) { om.color.set(0x000000); om.opacity = this.fade; }
    else if (!c.alive && !c.respawning) { om.color.set(0x300000); om.opacity = 0.55; }
    else if (this.pulse > 0) { om.color.set(0x8a0000); om.opacity = Math.min(0.55, this.pulse * 0.4) * (0.6 + 0.4 * Math.sin(G.time * 18)); }
    else if (c.ghost) { om.color.set(0x9fd3ff); om.opacity = 0.08; }
    else om.opacity = 0;
    this.overlay.visible = om.opacity > 0.001;
    const speed = delta.length() / Math.max(dt, 1e-4);
    const vt = S.vignette ? Math.min(0.85, Math.max(0, (speed - 2.5) * 0.25)) : 0;
    this.vignette.material.opacity += (vt - this.vignette.material.opacity) * Math.min(1, dt * 6);
    this.vignette.visible = this.vignette.material.opacity > 0.01;
    // wrist display
    this.wristT -= dt; if (this.wristT <= 0) { this.wristT = 0.25; this.drawWrist(); }
    const lh = c.handWorld[0]; const lq = c.handQuat[0];
    this.wrist.position.copy(lh).add(new THREE.Vector3(-0.07, 0.035, 0).applyQuaternion(lq));
    this.wrist.quaternion.copy(lq).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI)));
    this.wrist.visible = xr && c.alive;
    // desktop poke (F) at the Computer / shop
    if (I.desktop && !xr && I.down('KeyF')) { const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(0, 0), this.camera); ray.far = 2.5; G.computer?.pressFromRay(ray) || G.shop?.hit(ray); }
    if (I.desktop && !xr && I.down('KeyT')) G.debugCycleMonster();
  }
  grab(i) {
    const G = this.game, c = this.c, hp = c.handWorld[i];
    if (c.monster && G.tear.tryGrab(c, i)) return;
    const near = G.phys.nearest(hp, 0.13);
    if (near) { G.phys.grab(near.node, this.holders[i]); this.held[i] = near.node; if (near.body.kind !== 'bit') G.tear.squeeze(near.body, 'player:' + i, hp); return; }
    if (!c.monster) { // drag a teammate (e.g. one with no arms)
      for (const o of G.creatures) {
        if (o === c || !o.alive || o.monster || o.ghost) continue;
        for (const t of o.grabTargets()) if (t.pos.distanceTo(hp) < t.r + 0.08) { const obj = G.tear.partObject(o, t.part); this.dragging[i] = { victim: o, obj, local: obj.worldToLocal(hp.clone()) }; G.audio?.play('squish', hp, { volume: 0.3 }); return; }
      }
    }
  }
  ghostFly(dt, fwd, right) {
    const I = this.input; const st = I.hands[0].stick; const v = new THREE.Vector3();
    v.addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(I.head.quat), -st.y * 3).addScaledVector(right, st.x * 3);
    for (let i = 0; i < 2; i++) if (I.hands[i].grip) v.addScaledVector(I.hands[i].pos.clone().sub(I.head.pos).normalize(), 2.5);
    if (I.desktop && !I.xr) { const k = I.keys; v.addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(I.head.quat), ((k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0)) * 3).addScaledVector(right, ((k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0)) * 3); }
    this.rig.position.addScaledVector(v, dt); this.game.world.clampBounds(this.rig.position);
  }
  desktopMove(dt, fwd, right) {
    const I = this.input, c = this.c, k = I.keys, v = this.desktopVel;
    if (!c.alive || c.respawning || this.blindT > 0) { v.set(0, v.y, 0); }
    const want = new THREE.Vector3().addScaledVector(fwd, (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0)).addScaledVector(right, (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0));
    const both = c.armsPresent; const armK = both[0] && both[1] ? 1 : both[0] || both[1] ? 0.7 : 0;
    const sp = 3.6 * this.loco.speedMult * armK * (k.has('ShiftLeft') ? 1.5 : 1);
    if (want.lengthSq() > 0 && c.alive && this.blindT <= 0) want.normalize().multiplyScalar(sp);
    v.x += (want.x - v.x) * Math.min(1, dt * 10); v.z += (want.z - v.z) * Math.min(1, dt * 10);
    if (!this.loco.wallCrawl) v.y += CONFIG.GRAVITY * dt; else v.y = (k.has('Space') ? 2.5 : 0);
    this.rig.position.addScaledVector(v, dt);
    this.rig.updateMatrixWorld(true);
    const head = this.camera.getWorldPosition(new THREE.Vector3());
    // desktop has no hands to stand on, so stand as tall as a VR player leaning on their arms
    const body = head.clone().sub(new THREE.Vector3(0, this.loco.bodyOffset + (c.monster ? 0.2 : 0.5), 0)); const before = body.clone();
    const hit = this.game.world.resolveSphere(body, this.loco.bodyRadius, null, 3);
    let grounded = false;
    if (hit) { this.rig.position.add(body.sub(before)); const vn = v.dot(hit.normal); if (vn < 0) v.addScaledVector(hit.normal, -vn); grounded = hit.normal.y > 0.6; if (hit.surface === 'bouncy' && vn < -2) v.y = -vn * 0.8; if (this.loco.wallCrawl && hit.normal.y < 0.5) v.y = Math.max(v.y, 2); }
    if (grounded && I.down('Space') && armK > 0) v.y = 4.6 * this.loco.speedMult;
    this.game.world.clampBounds(this.rig.position);
  }
  drawWrist() {
    const G = this.game, g = this.wc.getContext('2d'), c = this.c, M = G.modes;
    g.clearRect(0, 0, 256, 128); g.fillStyle = 'rgba(10,20,12,0.85)'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#3CFF6E'; g.font = 'bold 26px "Courier New", monospace'; g.textAlign = 'center';
    const t = Math.max(0, Math.ceil(M.timer)); const timer = M.state === 'PLAYING' ? Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0') : M.state === 'COUNTDOWN' ? 'GET READY ' + t : M.state.replace('_', ' ');
    g.fillText(timer, 128, 36);
    g.font = '20px "Courier New", monospace';
    g.fillStyle = c.monster ? '#FF4040' : '#3CFF6E';
    g.fillText(c.ghost ? 'GHOST' : c.monster ? CONFIG.MONSTERS[c.monster].label + (this.abilityCD > 0 ? ' ' + Math.ceil(this.abilityCD) + 's' : ' READY') : 'SURVIVOR', 128, 72);
    g.fillStyle = '#E8E2D6'; g.fillText('SHARDS ' + G.save.data.shards, 128, 106);
    this.wt.needsUpdate = true;
  }
}
