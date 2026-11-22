// TORN - TearSystem. GRAB a part -> ANCHOR another part -> PULL apart -> TENSION -> TEAR.
// Works the same for the player monster (controllers) and bot monsters (bot hands).
// A) arm off at the shoulder  B) head off at the neck (then crack the skull)  C) torso split down the seam.
import * as THREE from 'three';
import { CONFIG, PALETTE, COSMETICS } from './config.js';

const UP = new THREE.Vector3(0, 1, 0);
const GORE_MATS = ['Fat', 'FatHi', 'Muscle', 'MuscleFiber', 'MuscleGap', 'Bone', 'BoneEdge', 'Marrow', 'Cavity', 'Artery', 'Vein', 'Blood', 'BloodDark'];
let STUFF_MAT = null;
const stuffMat = () => STUFF_MAT || (STUFF_MAT = new THREE.MeshStandardMaterial({ color: PALETTE.stuffing, roughness: 1 }));

export class TearSystem {
  constructor(game) { this.game = game; this.creak = new Map(); this.slowmo = 0; }

  victims() { return this.game.creatures.filter(c => c.canTear && !c.respawning); }
  state(m) { return m.tearState || (m.tearState = { hands: [null, null], pair: null, cooldown: 0 }); }
  bloodColorFor(monster) {
    if (monster.isLocal) { const id = this.game.save.data.equipped.blood; const c = COSMETICS.find(x => x.id === id); if (c) return c.blood; }
    return PALETTE.blood;
  }
  // ---- grabbing -------------------------------------------------------------------------------
  tryGrab(monster, i) {
    const st = this.state(monster); if (st.cooldown > 0 || !monster.monster) return false;
    const hp = monster.handWorld[i]; let best = null, bd = 1e9;
    for (const v of this.victims()) {
      if (v === monster) continue;
      for (const t of v.grabTargets()) { const d = t.pos.distanceTo(hp) - t.r; if (d < CONFIG.TEAR.GRAB_RANGE && d < bd) { bd = d; best = { victim: v, part: t.part, pos: t.pos } }; }
    }
    if (!best) return false;
    const part = this.partObject(best.victim, best.part);
    st.hands[i] = { victim: best.victim, part: best.part, local: part.worldToLocal(hp.clone()), obj: part, q0: monster.handQuat[i].clone() };
    best.victim.grabbedBy = monster; best.victim.struggle = 0;
    this.game.audio?.play('squish', hp, { volume: 0.5 });
    this.game.haptic(monster, i, 0.5, 60);
    this.game.events.emit('grabbed', best.victim, monster);
    return true;
  }
  release(monster, i) {
    const st = this.state(monster); const h = st.hands[i]; if (!h) return;
    st.hands[i] = null; st.pair = null;
    if (!st.hands.some(x => x && x.victim === h.victim)) { h.victim.grabbedBy = null; h.victim.setTension(null, 0, 0, UP); this.stopCreak(h.victim); }
  }
  releaseAll(monster) { for (let i = 0; i < 2; i++) this.release(monster, i); }
  partObject(v, part) {
    const S = v.surv;
    if (part === 'head') return S.head; if (part === 'torsoL') return S.tL; if (part === 'torsoR') return S.tR;
    return part === 'armL' ? S.arms[0].fore : S.arms[1].fore;
  }
  classify(a, b) {
    const arm = p => p === 'armL' ? 0 : p === 'armR' ? 1 : -1;
    const set = new Set([a, b]);
    if (set.has('torsoL') && set.has('torsoR')) return { type: 'split' };
    if (set.has('head') && (a !== b)) return { type: 'head' };
    if (a !== b && (arm(a) >= 0 || arm(b) >= 0)) return { type: 'arm', side: arm(a) >= 0 ? arm(a) : arm(b), tearHand: arm(a) >= 0 ? 0 : 1 };
    return null;
  }
  // ---- per frame ------------------------------------------------------------------------------
  update(dt) {
    if (this.slowmo > 0) this.slowmo -= dt / CONFIG.TEAR.SLOWMO_SCALE;
    for (const m of this.game.creatures) {
      if (!m.monster || !m.tearState) continue;
      const st = m.tearState; if (st.cooldown > 0) st.cooldown -= dt;
      for (let i = 0; i < 2; i++) { const h = st.hands[i]; if (h && (!h.victim.canTear || !this.partPresent(h.victim, h.part))) this.release(m, i); }
      const [h0, h1] = st.hands;
      // drag the victim with the grabbing hands
      for (let i = 0; i < 2; i++) { const h = st.hands[i]; if (!h) continue; const wp = h.obj.localToWorld(h.local.clone()); this.game.dragCreature(h.victim, m.handWorld[i].clone().sub(wp), dt, h0 && h1 ? 0.5 : 1); }
      if (h0 && h1 && h0.victim === h1.victim) {
        const v = h0.victim, cls = this.classify(h0.part, h1.part);
        if (!cls) continue;
        const d = m.handWorld[0].distanceTo(m.handWorld[1]);
        if (!st.pair || st.pair.type !== cls.type) st.pair = { type: cls.type, init: d, last: d, t: 0 };
        const P = st.pair;
        const relVel = (d - P.last) / Math.max(dt, 1e-4); P.last = d;
        const ext = Math.max(0, d - P.init);
        const ts = CONFIG.MONSTERS[m.monster].tear * (m.isBot ? this.game.botTearMult : 1);
        const need = CONFIG.TEAR.BREAK_DIST / ts;
        let twist = 0;
        if (cls.type === 'head') { const hi = h0.part === 'head' ? 0 : 1; twist = 2 * Math.acos(Math.min(1, Math.abs(m.handQuat[hi].dot(st.hands[hi].q0)))); }
        const target = (ext + Math.max(0, relVel) * CONFIG.TEAR.SPEED_BONUS) / need + twist / 2.2;
        P.t = target > P.t ? P.t + (target - P.t) * Math.min(1, dt * 12) : Math.max(target, P.t - dt * 0.6);
        const pullDir = cls.type === 'arm' ? m.handWorld[cls.tearHand].clone().sub(m.handWorld[1 - cls.tearHand]).normalize()
          : cls.type === 'head' ? m.handWorld[h0.part === 'head' ? 0 : 1].clone().sub(m.handWorld[h0.part === 'head' ? 1 : 0]).normalize() : UP;
        v.setTension(cls.type, cls.side ?? 0, Math.min(1, P.t), pullDir);
        this.feedback(m, v, P.t);
        if (P.t >= 1) this.tear(cls.type, v, cls.side ?? 0, m, pullDir, cls.tearHand ?? (h0.part === 'head' ? 0 : 1));
      } else {
        // fast one-handed yank (needs 2x force)
        for (let i = 0; i < 2; i++) {
          const h = st.hands[i]; if (!h || st.hands[1 - i]) continue;
          if (h.part !== 'head' && !h.part.startsWith('arm')) continue;
          const away = m.handWorld[i].clone().sub(h.victim.bodyCenter()).normalize();
          const sp = m.handVel[i].dot(away) - h.victim.vel.dot(away);
          if (sp > CONFIG.TEAR.YANK_SPEED * 2 / (CONFIG.MONSTERS[m.monster].tear + 1)) {
            this.tear(h.part === 'head' ? 'head' : 'arm', h.victim, h.part === 'armL' ? 0 : 1, m, away, i);
          } else if (h.victim.tension) { h.victim.setTension(null, 0, 0, UP); this.stopCreak(h.victim); }
        }
      }
    }
    // struggling: grabbed survivors shake hard for 1.5 s to break free
    for (const v of this.game.creatures) {
      if (!v.grabbedBy) continue;
      if (v.struggle >= CONFIG.TEAR.STRUGGLE_TIME) this.breakFree(v);
    }
    // thrown parts knock players back a little
    const phys = this.game.phys;
    for (const b of phys.bodies) {
      if (b.dead || b.frozen || !b.thrown || phys.time - b.thrown > 2 || b.knocked) continue;
      const vel = b.velocity(new THREE.Vector3(), phys.step); if (vel.length() < 3) continue;
      const c = b.center();
      for (const cr of this.game.creatures) {
        if (cr === b.owner || !cr.alive || cr.ghost) continue;
        if (cr.bodyCenter().distanceTo(c) < cr.radius + 0.18) { this.game.knockback(cr, vel.clone().setLength(1.6)); cr.flinch(); b.knocked = true; this.game.audio?.play('thud', c, { volume: 0.6 }); break; }
      }
    }
  }
  partPresent(v, part) { const S = v.surv; if (part === 'head') return !S.headless; if (part.startsWith('torso')) return !S.split; return S.arms[part === 'armL' ? 0 : 1].present; }
  feedback(m, v, t) {
    this.game.haptic(m, 0, 0.15 + t * 0.6, 30); this.game.haptic(m, 1, 0.15 + t * 0.6, 30);
    let c = this.creak.get(v);
    const pos = v.bodyCenter();
    if (!c && t > 0.05) { c = this.game.audio?.play('creak', pos, { volume: 0, loop: true }); if (c) this.creak.set(v, c); }
    if (c) { c.gain.gain.value = Math.min(1, t * 1.2); c.src.playbackRate.value = 0.6 + t * 0.9; c.setPos(pos); }
    if (v.isLocal) this.game.player?.hurtPulse(t);
  }
  stopCreak(v) { const c = this.creak.get(v); if (c) { c.stop(); this.creak.delete(v); } }
  breakFree(v) {
    const m = v.grabbedBy; if (!m) return;
    const st = this.state(m); for (let i = 0; i < 2; i++) if (st.hands[i] && st.hands[i].victim === v) this.release(m, i);
    st.cooldown = 1.0; v.struggle = 0; v.grabbedBy = null; v.setTension(null, 0, 0, UP); this.stopCreak(v);
    const away = v.bodyCenter().sub(m.bodyCenter()).setY(0).normalize().multiplyScalar(4).add(new THREE.Vector3(0, 2.5, 0));
    this.game.knockback(v, away);
    this.game.audio?.play('slap_wet', v.bodyCenter(), { volume: 1 });
    this.game.events.emit('brokeFree', v, m);
  }
  // ---- THE TEAR -------------------------------------------------------------------------------
  tear(type, v, side, m, dir, holdHand) {
    const st = this.state(m); const G = this.game, gore = G.save.data.gore, color = this.bloodColorFor(m);
    const S = v.surv;
    for (let i = 0; i < 2; i++) st.hands[i] = null; st.pair = null; st.cooldown = 0.4;
    v.grabbedBy = null; v.setTension(null, 0, 0, UP); this.stopCreak(v);
    const pos = v.bodyCenter();
    G.audio?.play(gore === 'OFF' ? 'poof' : 'tear', pos, { volume: 1 });
    if (gore !== 'OFF') G.audio?.play('bone', pos, { volume: 0.9 });
    G.haptic(m, 0, 1, 180); G.haptic(m, 1, 1, 180);
    if (m.isLocal) this.slowmo = CONFIG.TEAR.SLOWMO;
    if (v.isLocal) G.player?.hurtPulse(1.5);
    v.shakeTorn(); v.flinch();
    // monster hands get bloody -> handprints
    G.gore.markBloody(m.id + ':0', color); G.gore.markBloody(m.id + ':1', color);
    let held = null;
    if (type === 'arm') held = this.tearArm(v, side, dir, color);
    else if (type === 'head') held = this.tearHead(v, dir, color);
    else held = this.split(v, dir, color);
    // the tearing hand keeps hold of the torn part
    if (held && m.isLocal) G.player.holdBody(holdHand, held);
    else if (held && m.isBot) G.botHold?.(m, holdHand, held);
    G.events.emit('tear', { type, victim: v, monster: m });
  }
  wound(objName) { return this.game.models.get(objName); }
  capOn(obj, name, localPos, localNormal, parentScale = null) {
    const c = this.wound(name); c.position.copy(localPos); c.quaternion.setFromUnitVectors(UP, localNormal.clone().normalize());
    if (parentScale) c.scale.set(1 / parentScale.x, 1 / parentScale.y, 1 / parentScale.z);
    obj.add(c); return c;
  }
  impactFX(kind) {
    const G = this.game;
    return (b, n, speed, hit) => {
      b.jiggle = 1;
      if (G.save.data.gore !== 'OFF' && speed > 1.5) { G.gore.splat(n.p, hit.normal, 0.12 + Math.min(0.25, speed * 0.03), { dir: b.velocity(new THREE.Vector3(), G.phys.step) }); }
      G.audio?.play(kind === 'organ' ? 'plop' : speed > 4 ? 'thud' : 'splat', n.p, { volume: Math.min(1, speed / 6) });
      if (kind === 'organ' && speed > 3 && Math.random() < 0.3) G.gore.pool(n.p, 0.25 + Math.random() * 0.2);
      if (b.info.isHead && speed > 5.5 && G.save.data.gore !== 'OFF') this.crackSkull(b, n.p);
    };
  }
  tearArm(v, side, dir, color) {
    const G = this.game, S = v.surv, a = S.arms[side], gore = G.save.data.gore;
    a.present = false;
    const tip = a.wrist.clone().add(new THREE.Vector3(0.11, 0, 0).applyQuaternion(a.hand.quaternion));
    const pts = [a.shoulder.clone(), a.elbow.clone(), a.wrist.clone(), tip];
    const lens = [pts[0].distanceTo(pts[1]), pts[1].distanceTo(pts[2]), 0];
    for (const o of [a.upper, a.fore, a.hand]) v.detach(o);
    a.hOpen.visible = true; a.hClosed.visible = false;
    const endCap = this.capOn(a.upper, gore === 'OFF' ? 'wound_stuffing_arm' : 'wound_arm_end', new THREE.Vector3(0.005, 0, 0), new THREE.Vector3(-1, 0, 0), a.upper.scale);
    const body = G.phys.addChain(pts, [a.upper, a.fore, a.hand], 'part', { r: 0.035, modelLen: lens, vel: dir.clone().multiplyScalar(1.5) });
    body.owner = v; body.info = { kind: 'arm', side }; body.onImpact = this.impactFX('part');
    const cap = gore === 'OFF' ? S.caps.shoulderStuff[side] : S.caps.shoulder[side]; cap.visible = true; cap.userData.final = true;
    G.gore.burst(a.shoulder, dir, { color });
    G.gore.spray(cap, new THREE.Vector3(0, 1, 0), { color }); G.gore.spray(endCap, new THREE.Vector3(0, 1, 0), { color, duration: 1.2, drips: 4 });
    G.gore.pool(v.bodyCenter(), undefined);
    G.events.emit('armLost', v, side);
    return body;
  }
  tearHead(v, dir, color) {
    const G = this.game, S = v.surv, gore = G.save.data.gore;
    S.headless = true;
    const head = v.detach(S.head);
    if (v.isLocal) head.traverse(o => o.layers.set(0));
    const neckCap = this.capOn(head, gore === 'OFF' ? 'wound_stuffing_neck' : 'wound_neck_head', new THREE.Vector3(0, 0.004, 0), new THREE.Vector3(0, -1, 0));
    const hc = head.localToWorld(new THREE.Vector3(0, 0.135, 0));
    const hb = G.phys.addRigid(head, 'part', { size: 0.07, r: 0.11, center: hc, vel: dir.clone().multiplyScalar(2).add(new THREE.Vector3(0, 1, 0)), spin: 3 });
    hb.owner = v; hb.info = { kind: 'head', isHead: true, soft: true }; hb.onImpact = this.impactFX('part');
    if (gore !== 'OFF') { // a short dangling spine under the head
      const base = head.localToWorld(new THREE.Vector3(0, 0, 0));
      const pts = [base, base.clone().add(new THREE.Vector3(0, -0.04, 0)), base.clone().add(new THREE.Vector3(0, -0.08, 0)), base.clone().add(new THREE.Vector3(0, -0.12, 0))];
      const verts = [0, 1, 2].map(() => { const o = G.models.get('organ_spine_segment'); G.scene.add(o); return o; });
      const sp = G.phys.addChain(pts, verts, 'organ', { r: 0.018, modelLen: ['center', 'center', 'center'] });
      sp.owner = v; G.phys.tie(sp.nodes[0], hb.nodes[0], 0.13, 1);
    }
    const cap = gore === 'OFF' ? S.caps.neckStuff : S.caps.neck; cap.visible = true; cap.userData.final = true;
    G.gore.burst(hc, dir.clone().add(UP), { color });
    G.gore.spray(cap, new THREE.Vector3(0, 1, 0), { color }); G.gore.spray(neckCap, new THREE.Vector3(0, 1, 0), { color, duration: 1.2 });
    G.gore.pool(v.bodyCenter());
    this.ragdollRemains(v, dir, color);
    G.events.emit('killed', v, 'head');
    return hb;
  }
  // remaining body after a head-off: torso (both halves together) + arms fall as one floppy body
  ragdollRemains(v, dir) {
    const G = this.game, S = v.surv;
    v.alive = false;
    const torso = v.detach(S.torso);
    const tb = G.phys.addRigid(torso, 'part', { size: 0.12, r: 0.17, vel: dir.clone().multiplyScalar(1.2) });
    tb.owner = v; tb.info = { kind: 'torso', soft: false }; tb.onImpact = this.impactFX('part');
    this.armsOnto(v, tb, torso);
    return tb;
  }
  armsOnto(v, body, torsoObj, onlySide = null) {
    const G = this.game, S = v.surv;
    S.arms.forEach((a, i) => {
      if (!a.present || (onlySide !== null && onlySide !== i)) return;
      a.present = false;
      const tip = a.wrist.clone().add(new THREE.Vector3(0.11, 0, 0).applyQuaternion(a.hand.quaternion));
      const pts = [a.shoulder.clone(), a.elbow.clone(), a.wrist.clone(), tip];
      for (const o of [a.upper, a.fore, a.hand]) v.detach(o);
      const ch = G.phys.addChain(pts, [a.upper, a.fore, a.hand], 'part', { r: 0.03, modelLen: [pts[0].distanceTo(pts[1]), pts[1].distanceTo(pts[2]), 0] });
      ch.owner = v; ch.onImpact = this.impactFX('part');
      // tie the shoulder end to the nearest torso node
      let best = body.nodes[0], bd = 1e9; for (const n of body.nodes) { const d = n.p.distanceTo(pts[0]); if (d < bd) { bd = d; best = n; } }
      G.phys.tie(ch.nodes[0], best, bd, 1);
    });
  }
  split(v, dir, color) {
    const G = this.game, S = v.surv, gore = G.save.data.gore;
    S.split = true; v.alive = false;
    const center = v.bodyCenter();
    if (gore === 'OFF') for (const half of [S.tL, S.tR]) half.traverse(o => { if (o.isMesh && GORE_MATS.includes(o.material?.name)) o.material = stuffMat(); });
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(S.torso.getWorldQuaternion(new THREE.Quaternion()));
    const tL = v.detach(S.tL), tR = v.detach(S.tR);
    const bL = G.phys.addRigid(tL, 'part', { size: 0.1, r: 0.13, center: tL.localToWorld(new THREE.Vector3(0.08, 0, 0)), vel: side.clone().multiplyScalar(3.4).add(new THREE.Vector3(0, 1.6, 0)), spin: -4 });
    const bR = G.phys.addRigid(tR, 'part', { size: 0.1, r: 0.13, center: tR.localToWorld(new THREE.Vector3(-0.08, 0, 0)), vel: side.clone().multiplyScalar(-3.4).add(new THREE.Vector3(0, 1.6, 0)), spin: 4 });
    for (const b of [bL, bR]) { b.owner = v; b.info = { kind: 'half' }; b.onImpact = this.impactFX('part'); }
    // each half keeps its arm
    this.armsOnto(v, bL, tL, 0); this.armsOnto(v, bR, tR, 1);
    // the head flops off with the left half (loosely tied by the neck)
    if (!S.headless) {
      S.headless = true; const head = v.detach(S.head); if (v.isLocal) head.traverse(o => o.layers.set(0));
      const hb = G.phys.addRigid(head, 'part', { size: 0.07, r: 0.11, center: head.localToWorld(new THREE.Vector3(0, 0.135, 0)) });
      hb.owner = v; hb.info = { kind: 'head', isHead: true, soft: true }; hb.onImpact = this.impactFX('part');
      G.phys.tie(hb.nodes[0], bL.nodes[0], 0.3, 0.6);
    }
    G.gore.burst(center, UP, { intensity: 1.4, color });
    G.gore.burst(center, side, { intensity: 0.6, color, chunks: false }); G.gore.burst(center, side.clone().negate(), { intensity: 0.6, color, chunks: false });
    G.gore.spray(tL, new THREE.Vector3(-1, 0.3, 0), { color }); G.gore.spray(tR, new THREE.Vector3(1, 0.3, 0), { color });
    G.gore.pool(center, 0.55 + Math.random() * 0.1);
    if (gore === 'FULL') this.spillOrgans(v, center, bL, bR, color);
    G.events.emit('killed', v, 'split');
    return bL;
  }
  spillOrgans(v, c, bL, bR, color) {
    const G = this.game;
    const spawn = (name, off, vel, opts = {}) => {
      const o = G.models.get(name, opts.morph ? true : null); o.position.copy(c).add(off); o.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); G.scene.add(o);
      const b = G.phys.addRigid(o, 'organ', { size: opts.size || 0.03, r: opts.r || 0.035, vel, spin: 4 });
      b.owner = v; b.info = { kind: name, soft: true }; b.onImpact = this.impactFX('organ'); return b;
    };
    const rnd = (s = 1) => new THREE.Vector3((Math.random() - .5) * 2 * s, Math.random() * 1.5 * s, (Math.random() - .5) * 2 * s);
    // the HEART keeps beating for 5 s, then stops
    const heart = spawn('organ_heart', new THREE.Vector3(0, 0.08, 0.05), rnd(1.2).add(new THREE.Vector3(0, 1, 0)), { morph: true, size: 0.03, r: 0.04 });
    heart.info.beat = { t: 0, phase: 0, last: 0 };
    let mesh = null; heart.bind[0].obj.traverse(o => { if (o.isMesh && o.morphTargetDictionary && o.morphTargetDictionary.beat !== undefined) mesh = o; });
    heart.onUpdate = (b, dt) => {
      const B = b.info.beat; B.t += dt; if (B.t > 5.5) return;
      const bpm = 90 * Math.max(0, 1 - B.t / 5); B.phase += dt * bpm / 60;
      const ph = B.phase % 1; const pulse = Math.exp(-(((ph - 0.1) / 0.07) ** 2)) + 0.6 * Math.exp(-(((ph - 0.35) / 0.07) ** 2));
      if (mesh) mesh.morphTargetInfluences[mesh.morphTargetDictionary.beat] = Math.min(1, pulse);
      else b.bind[0].obj.scale.setScalar(1 - 0.12 * Math.min(1, pulse));
      if (Math.floor(B.phase) !== B.last && bpm > 5) { B.last = Math.floor(B.phase); const p = b.center(); G.audio?.play('heartbeat', p, { volume: 0.8, rate: 0.9 + bpm / 300 }); const top = new THREE.Vector3(0, 1, 0).applyQuaternion(b.bind[0].obj.quaternion); for (let k = 0; k < 4; k++) G.gore.spawn(p.clone().addScaledVector(top, 0.06), top.clone().multiplyScalar(1.2).add(rnd(0.3)), 0.004, new THREE.Color(color)); }
    };
    spawn('organ_lung_L', new THREE.Vector3(0.06, 0.06, 0), rnd(1.2), { size: 0.05, r: 0.05 });
    spawn('organ_lung_R', new THREE.Vector3(-0.06, 0.06, 0), rnd(1.2), { size: 0.05, r: 0.05 });
    spawn('organ_stomach', new THREE.Vector3(0.04, -0.04, 0.04), rnd(1), { size: 0.04, r: 0.045 });
    spawn('organ_liver', new THREE.Vector3(-0.05, -0.02, 0.04), rnd(1), { size: 0.05, r: 0.05 });
    // a long rope of intestines draping between the two halves
    const N = 14, pts = [], meshes = [];
    const a = bL.nodes[0].p.clone(), b = bR.nodes[0].p.clone();
    for (let k = 0; k <= N; k++) { const t = k / N; const p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI) * 0.35; p.addScaledVector(new THREE.Vector3(1, 0, 0), (t - 0.5) * 0.5); p.z += Math.sin(t * Math.PI * 3) * 0.08; pts.push(p); }
    for (let k = 0; k < N; k++) { const o = G.models.get(k === 0 || k === N - 1 ? 'organ_intestine_end' : 'organ_intestine_segment'); if (k === 0) o.scale.x = -1; G.scene.add(o); meshes.push(o); }
    const rope = G.phys.addChain(pts, meshes, 'organ', { r: 0.016, modelLen: new Array(N).fill('center'), minBend: 0.3, stiff: 0.9 });
    rope.owner = v; rope.info = { kind: 'intestine', soft: true }; rope.onImpact = this.impactFX('organ');
    G.phys.tie(rope.nodes[0], bL.nodes[0], 0.05, 0.8); G.phys.tie(rope.nodes[N], bR.nodes[0], 0.05, 0.8);
    G.audio?.play('plop', c, { volume: 1 });
  }
  // slam a head hard (or squeeze with both hands) -> skull splits in 2, the brain pops out
  crackSkull(hb, at) {
    const G = this.game; if (hb.dead || hb.info.cracked) return; hb.info.cracked = true;
    const gore = G.save.data.gore; if (gore === 'OFF') return;
    const head = hb.bind[0].obj; const c = hb.center(); const q = head.getWorldQuaternion(new THREE.Quaternion());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    G.phys.kill(hb);
    for (const [name, s] of [['survivor_skull_L', 1], ['survivor_skull_R', -1]]) {
      const o = G.models.get(name, ['Skin']); o.position.copy(head.position); o.quaternion.copy(q); G.scene.add(o);
      const mat = head.getObjectByProperty?.('isMesh', true)?.material; if (mat && mat.name === 'Skin') o.traverse(m => { if (m.isMesh && m.material.name === 'Skin') m.material.color.copy(mat.color); });
      const b = G.phys.addRigid(o, 'part', { size: 0.06, r: 0.08, center: c.clone().addScaledVector(right, 0.05 * s), vel: right.clone().multiplyScalar(1.6 * s).add(new THREE.Vector3(0, 1.4, 0)), spin: 5 });
      b.owner = hb.owner; b.onImpact = this.impactFX('part');
    }
    if (gore === 'FULL') {
      const br = G.models.get('survivor_brain'); br.position.copy(c); br.quaternion.copy(q); G.scene.add(br);
      const b = G.phys.addRigid(br, 'organ', { size: 0.04, r: 0.055, center: c, vel: new THREE.Vector3(0, 2.2, 0).add(new THREE.Vector3((Math.random() - .5), 0, (Math.random() - .5))), spin: 4 });
      b.owner = hb.owner; b.info = { kind: 'brain', soft: true }; b.onImpact = this.impactFX('organ');
    }
    G.audio?.play('skull', c, { volume: 1 }); G.gore.burst(c, UP, { intensity: 0.7 });
    G.gore.pool(c, 0.4);
  }
  // squeeze any held organ/part (squish + squirt). Both hands on a head = crack it.
  squeeze(body, handKey, pos) {
    const G = this.game; body.squeeze = 1; body.jiggle = 1;
    G.audio?.play('squish', pos, { volume: 0.9 });
    if (G.save.data.gore !== 'OFF') { for (let k = 0; k < 10 * G.gore.mult; k++) G.gore.spawn(pos, new THREE.Vector3((Math.random() - .5) * 2, Math.random() * 2, (Math.random() - .5) * 2), 0.005, new THREE.Color(PALETTE.blood)); G.gore.markBloody(handKey); }
    else G.gore.burst(pos, UP, { intensity: 0.2, chunks: false });
    if (body.info.isHead && (body.held || 0) >= 2) this.crackSkull(body, pos);
  }
}
