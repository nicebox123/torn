// TORN - PlayerRig / MonsterRig. A "Creature" is any player or bot: survivor body (tearable parts) or a monster.
// Coordinates: models face +Z, character LEFT = +X, arms modelled along +X. Hand index 0 = left, 1 = right.
import * as THREE from 'three';
import { CONFIG, COSMETICS, ATTACH, PALETTE } from './config.js';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
export const OWN_HEAD_LAYER = 5;

export const MONSTER_RIGS = {
  BUTCHER: { body: 'butcher_body', upper: 'butcher_upperarm', fore: 'butcher_forearm', hand: 'butcher_hand', seg: 0.45, eye: [0, 0.44, 0.27],
    shoulders: [[0.40, 0.27, 0.02], [-0.40, 0.27, 0.02]], skin: ['ButcherSkin', 'ButcherPatch'], tagY: 0.8, reach: 1.25 },
  STITCHFACE: { body: 'stitchface_body', upper: 'stitchface_upperarm', fore: 'stitchface_forearm', hand: 'stitchface_hand', seg: 0.55, eye: [0, 0.52, 0.27],
    shoulders: [[0.27, 0.24, 0.08], [-0.27, 0.24, 0.08]], skin: ['SFPatch1', 'SFPatch2', 'SFPatch3', 'SFPatch4', 'SFPatch5'], tagY: 0.95, reach: 1.45 },
  CRAWLER: { body: 'crawler_body', upper: 'crawler_upperarm', fore: 'crawler_forearm', hand: 'crawler_hand', seg: 0.4, eye: [0, 0.1, 0.34],
    shoulders: [[0.26, 0.02, 0.18], [-0.26, 0.02, 0.18], [0.24, 0.02, -0.12], [-0.24, 0.02, -0.12]], skin: ['CrawlerShell', 'CrawlerUnder'], tagY: 0.5, reach: 1.15 },
};
// hand model axes (fingers +X, palm -Y, thumb -Z) -> controller grip space (forward -Z, up +Y)
export const HAND_OFFSET = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
  new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0)));

export function solveIK(S, W, l1, l2, pole, outE) {
  const d = _a.subVectors(W, S); let len = d.length();
  const dir = d.clone().divideScalar(Math.max(len, 1e-5));
  len = Math.min(len, l1 + l2 - 1e-4);
  const a = (l1 * l1 - l2 * l2 + len * len) / (2 * len);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const bend = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (bend.lengthSq() < 1e-8) bend.set(0, -1, 0).addScaledVector(dir, dir.y);
  bend.normalize();
  outE.copy(S).addScaledVector(dir, a).addScaledVector(bend, h);
  return bend;
}
export function orientX(obj, from, to, upHint, modelLen) {
  const x = _b.subVectors(to, from); const L = x.length(); if (L < 1e-5) return;
  x.divideScalar(L);
  const y = _c.copy(upHint).addScaledVector(x, -upHint.dot(x)); if (y.lengthSq() < 1e-6) y.set(0, 1, 0).addScaledVector(x, -x.y); y.normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  _m.makeBasis(x, y, z); obj.quaternion.setFromRotationMatrix(_m);
  if (obj.parent && obj.parent.type !== 'Scene') { obj.parent.getWorldQuaternion(_q).invert(); obj.quaternion.premultiply(_q); }
  obj.position.copy(from); if (obj.parent && obj.parent.type !== 'Scene') obj.parent.worldToLocal(obj.position);
  obj.scale.set(L / modelLen, 1, 1);
}

function makeTag(text, red) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.font = 'bold 34px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText(text, 128, 34); g.fillStyle = red ? '#FF3030' : '#F0EBE1'; g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.125), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.renderOrder = 5; return m;
}
function setLayer(obj, layer) { obj.traverse(o => o.layers.set(layer)); }
function hideStitches(obj, hide) { obj.traverse(o => { if (o.isMesh && o.material && /Stitch/.test(o.material.name)) o.visible = !hide; }); }

let GHOST_MAT = null;
function ghostMat() { return GHOST_MAT || (GHOST_MAT = new THREE.MeshStandardMaterial({ color: PALETTE.ghost, emissive: PALETTE.ghost, emissiveIntensity: 0.35, transparent: true, opacity: 0.65, depthWrite: false })); }

export class Creature {
  constructor(game, { name = 'SUBJECT', color = [9, 9, 9], isLocal = false, isBot = false } = {}) {
    this.game = game; this.name = name; this.color = color.slice(); this.isLocal = isLocal; this.isBot = isBot;
    this.root = new THREE.Group(); this.root.name = 'creature_' + name; game.scene.add(this.root);
    this.headPos = new THREE.Vector3(0, 1, 0); this.headQuat = new THREE.Quaternion(); this.yaw = 0;
    this.handTarget = [new THREE.Vector3(), new THREE.Vector3()]; this.handQuat = [new THREE.Quaternion(), new THREE.Quaternion()];
    this.handWorld = [new THREE.Vector3(), new THREE.Vector3()]; this.handVel = [new THREE.Vector3(), new THREE.Vector3()]; this.prevHand = [new THREE.Vector3(), new THREE.Vector3()];
    this.grip = [false, false]; this.gripAnim = [0, 0];
    this.vel = new THREE.Vector3(); this.prevHead = new THREE.Vector3();
    this.equipped = {}; this.glowColor = 0;
    this.monster = null; this.ghost = false;
    this.anim = { blink: 2 + Math.random() * 4, blinkT: 0, dbl: false, flinch: 0, tornShake: 0, transform: 0, talk: 0, roar: 0, twitch: 0, crawl: 0 };
    this.tension = null; this.grabbedBy = null; this.struggle = 0;
    this.tag = makeTag(name, false); game.scene.add(this.tag);
    this.buildSurvivor();
  }
  // ------------------------------------------------------------------ build
  buildSurvivor() {
    const M = this.game.models;
    if (this.surv) this.root.remove(this.surv.group);
    const g = new THREE.Group(); this.root.add(g);
    const skinNames = ['Skin', 'SkinPatch', 'Palm'];
    const head = M.get('survivor_head', skinNames);
    const torso = new THREE.Group();
    const tL = M.get('survivor_torso_L', skinNames), tR = M.get('survivor_torso_R', skinNames);
    torso.add(tL, tR); g.add(head, torso);
    this.skinMats = new Set();
    const collect = o => o.traverse(m => { if (m.isMesh && m.material && skinNames.includes(m.material.name)) this.skinMats.add(m.material); });
    collect(head); collect(tL); collect(tR);
    const arms = [];
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const upper = M.get('survivor_upperarm', skinNames), fore = M.get('survivor_forearm', skinNames);
      const hOpen = M.get('survivor_hand_open', skinNames), hClosed = M.get('survivor_hand_closed', skinNames);
      const hand = new THREE.Group(); hand.add(hOpen, hClosed); hClosed.visible = false;
      if (side > 0) { hOpen.scale.y = -1; hClosed.scale.y = -1; }   // left hand = mirrored right hand
      const ag = new THREE.Group(); ag.add(upper, fore, hand); g.add(ag);
      for (const o of [upper, fore]) collect(o);
      const handMats = new Set(); for (const o of [hOpen, hClosed]) o.traverse(m => { if (m.isMesh && m.material && skinNames.includes(m.material.name)) handMats.add(m.material); });
      arms.push({ group: ag, upper, fore, hand, hOpen, hClosed, side, handMats, present: true, elbow: new THREE.Vector3(), shoulder: new THREE.Vector3(), wrist: new THREE.Vector3(), gap: new THREE.Vector3(), stretch: 1 });
    }
    const eyes = [head.getObjectByName('eye_L'), head.getObjectByName('eye_R')].filter(Boolean);
    const jaw = head.getObjectByName('jaw');
    // wound caps (hidden until something is torn off)
    const capMats = (name) => M.get(name);
    const caps = {
      shoulder: [capMats('wound_shoulder'), capMats('wound_shoulder')], shoulderStuff: [capMats('wound_stuffing_shoulder'), capMats('wound_stuffing_shoulder')],
      neck: capMats('wound_neck_body'), neckStuff: capMats('wound_stuffing_neck'),
    };
    for (let i = 0; i < 2; i++) for (const c of [caps.shoulder[i], caps.shoulderStuff[i]]) {
      const side = i === 0 ? 1 : -1; c.position.set(0.158 * side, 0.115, 0); c.quaternion.setFromUnitVectors(UP, new THREE.Vector3(side, 0.2, 0).normalize()); c.visible = false;
      (side > 0 ? tL : tR).add(c);
    }
    for (const c of [caps.neck, caps.neckStuff]) { c.position.set(0, 0.198, 0); c.visible = false; tL.add(c); }
    // tension strands (red tissue stretched between parts while being pulled)
    const strandMat = new THREE.MeshStandardMaterial({ color: '#8E1B1B', roughness: 0.3 });
    const strands = new THREE.Group(); strands.visible = false; g.add(strands);
    for (let k = 0; k < 6; k++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.004 + Math.random() * 0.004, 0.006, 1, 5), k % 3 === 2 ? new THREE.MeshStandardMaterial({ color: '#EBC75E', roughness: 0.4 }) : strandMat); s.userData.off = new THREE.Vector3((Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.04); strands.add(s); }
    this.surv = { group: g, head, torso, tL, tR, arms, eyes, jaw, caps, strands, headless: false, split: false, cosmetics: {} };
    this.alive = true; this.downed = false;
    if (this.isLocal) setLayer(head, OWN_HEAD_LAYER);
    this.setColor(this.color);
    this.applyCosmetics(this.equipped, this.glowColor);
    this.surv.group.visible = !this.monster;
  }
  buildMonster(type) {
    const M = this.game.models, R = MONSTER_RIGS[type];
    if (this.mon) this.root.remove(this.mon.group);
    const g = new THREE.Group(); this.root.add(g);
    const body = M.get(R.body, R.skin); g.add(body);
    if (this.isLocal) setLayer(body, OWN_HEAD_LAYER);
    const skinMats = new Set(); body.traverse(o => { if (o.isMesh && o.material && R.skin.includes(o.material.name)) skinMats.add(o.material); });
    const shoulders = R.shoulders.map((s, i) => {
      const n = ['shoulder_L', 'shoulder_R', 'shoulder_BL', 'shoulder_BR'][i];
      const e = body.getObjectByName(n) || body.getObjectByName(['shoulder_FL', 'shoulder_FR', 'shoulder_BL', 'shoulder_BR'][i]);
      return e ? e.position.clone() : new THREE.Vector3(...s);
    });
    const arms = shoulders.map((s, i) => {
      const side = s.x > 0 ? 1 : -1;
      const upper = M.get(R.upper, R.skin), fore = M.get(R.fore, R.skin);
      const hOpen = M.get(R.hand + '_open', R.skin), hClosed = M.get(R.hand + '_closed', R.skin);
      for (const o of [upper, fore, hOpen, hClosed]) o.traverse(m => { if (m.isMesh && m.material && R.skin.includes(m.material.name)) skinMats.add(m.material); });
      const hand = new THREE.Group(); hand.add(hOpen, hClosed); hClosed.visible = false;
      if (side > 0) { hOpen.scale.y = -1; hClosed.scale.y = -1; }
      const ag = new THREE.Group(); ag.add(upper, fore, hand); g.add(ag);
      return { group: ag, upper, fore, hand, hOpen, hClosed, side, shoulderLocal: s, elbow: new THREE.Vector3(), shoulder: new THREE.Vector3(), wrist: new THREE.Vector3(), extra: i >= 2, phase: Math.random() * 6, foot: new THREE.Vector3(), present: true };
    });
    const morphs = []; body.traverse(o => { if (o.isMesh && o.morphTargetDictionary) morphs.push(o); });
    const trophies = []; for (let k = 1; k <= 6; k++) { const t = body.getObjectByName('trophy_' + k); if (t) trophies.push({ o: t, base: t.quaternion.clone(), ax: 0, az: 0, vx: 0, vz: 0 }); }
    this.mon = { type, R, group: g, body, arms, skinMats, morphs, jaw: body.getObjectByName('jaw'), eyeBig: body.getObjectByName('eye_big'),
      pincers: [body.getObjectByName('pincer_L'), body.getObjectByName('pincer_R')], trophies, baseSkin: [...skinMats].map(m => m.color.clone()) };
    this.applyMonsterSkin();
  }
  // ------------------------------------------------------------------ looks
  setColor(rgb) {
    this.color = rgb.slice();
    const tint = new THREE.Color(rgb[0] / 9, rgb[1] / 9, rgb[2] / 9);
    const base = new THREE.Color(PALETTE.skin);
    for (const m of this.skinMats) { if (!m.userData.base) m.userData.base = m.color.clone(); m.color.copy(m.userData.base).multiply(tint); }
    for (const a of this.surv.arms) if (!this.equipped.hands) for (const m of a.handMats) { if (!m.userData.base) m.userData.base = m.color.clone(); m.color.copy(m.userData.base).multiply(tint); }
  }
  applyCosmetics(equipped = {}, glowColor = 0) {
    this.equipped = Object.assign({}, equipped); this.glowColor = glowColor;
    const S = this.surv; if (!S) return;
    for (const k in S.cosmetics) { S.cosmetics[k].removeFromParent(); }
    S.cosmetics = {};
    for (const e of S.eyes) e.visible = true;
    for (const [slot, id] of Object.entries(this.equipped)) {
      const c = COSMETICS.find(x => x.id === id); if (!c) continue;
      if (c.model) {
        const o = this.game.models.get(c.model, c.glow ? ['GlowEye'] : null);
        const a = ATTACH[c.slot] || [0, 0.24, 0];
        o.position.set(a[0] + c.offset[0], a[1] + c.offset[1], a[2] + c.offset[2]); o.rotation.set(...c.rot); o.scale.setScalar(c.scale);
        if (c.glow) { o.traverse(m => { if (m.isMesh && m.material && m.material.name === 'GlowEye') { m.material.color.set(c.glow[glowColor % 3]); m.material.emissive.set(c.glow[glowColor % 3]); } }); for (const e of S.eyes) e.visible = false; }
        S.head.add(o); S.cosmetics[slot] = o;
        if (this.isLocal) setLayer(o, OWN_HEAD_LAYER);
      } else if (c.material && c.slot === 'hands') {
        const mat = new THREE.MeshStandardMaterial({ color: c.material.color, metalness: c.material.metalness || 0, roughness: c.material.roughness ?? 0.6, emissive: c.material.emissive || 0x000000, emissiveIntensity: c.material.emissive ? 0.8 : 0 });
        for (const a of S.arms) for (const h of [a.hOpen, a.hClosed]) h.traverse(m => { if (m.isMesh && m.material && /Skin|Palm/.test(m.material.name)) { m.userData.orig = m.userData.orig || m.material; m.material = mat; } });
      }
    }
    if (!this.equipped.hands) for (const a of S.arms) for (const h of [a.hOpen, a.hClosed]) h.traverse(m => { if (m.isMesh && m.userData.orig) m.material = m.userData.orig; });
    this.applyMonsterSkin();
  }
  applyMonsterSkin() {
    if (!this.mon) return;
    const id = this.equipped.mskin; const c = COSMETICS.find(x => x.id === id);
    [...this.mon.skinMats].forEach((m, i) => {
      m.color.copy(this.mon.baseSkin[i]); m.emissive?.set(0x000000); m.metalness = 0;
      if (c && c.material) { m.color.set(c.material.color); if (c.material.emissive) { m.emissive.set(c.material.emissive); m.emissiveIntensity = c.material.emissiveIntensity || 0.3; } m.metalness = c.material.metalness || 0; }
    });
  }
  setName(n) { this.name = n; const old = this.tag; this.tag = makeTag(n, !!this.monster); this.game.scene.add(this.tag); old.removeFromParent(); }
  // ------------------------------------------------------------------ state changes
  setMonster(type) {
    this.monster = type;
    if (type) { this.buildMonster(type); this.surv.group.visible = false; this.mon.group.visible = true; }
    else { if (this.mon) { this.root.remove(this.mon.group); this.mon = null; } this.surv.group.visible = true; }
    this.setName(this.name);
    this.anim.transform = 0; this.root.scale.setScalar(1);
  }
  setGhost(on) {
    this.ghost = on; const S = this.surv;
    S.group.traverse(o => { if (o.isMesh) { if (on) { o.userData.mat = o.userData.mat || o.material; o.material = ghostMat(); } else if (o.userData.mat) o.material = o.userData.mat; } });
    hideStitches(S.group, on);
    if (on) S.group.visible = true;
  }
  get radius() { return this.monster ? CONFIG.MONSTERS[this.monster].radius : CONFIG.BODY_RADIUS; }
  get armsPresent() { return this.monster ? [true, true] : this.surv.arms.map(a => a.present); }
  get canTear() { return this.alive && !this.ghost && !this.monster && !this.downed && !this.doomed && !this.infecting && !this.respawning; }
  bodyCenter(out = new THREE.Vector3()) {
    if (this.monster) return out.copy(this.mon.body.getWorldPosition(out));
    return this.surv.torso.getWorldPosition(out);
  }
  // Grab targets the monster can grab (world space)
  grabTargets() {
    const S = this.surv, out = [];
    if (!S || this.monster || !this.alive) return out;
    if (!S.headless) out.push({ part: 'head', pos: S.head.localToWorld(new THREE.Vector3(0, 0.135, 0)), r: 0.13 });
    if (!S.split) {
      out.push({ part: 'torsoL', pos: S.tL.localToWorld(new THREE.Vector3(0.085, 0, 0)), r: 0.13 });
      out.push({ part: 'torsoR', pos: S.tR.localToWorld(new THREE.Vector3(-0.085, 0, 0)), r: 0.13 });
    }
    S.arms.forEach((a, i) => { if (a.present) { out.push({ part: i === 0 ? 'armL' : 'armR', pos: a.elbow.clone(), r: 0.08 }); out.push({ part: i === 0 ? 'armL' : 'armR', pos: a.shoulder.clone().lerp(a.elbow, 0.5), r: 0.07 }); out.push({ part: i === 0 ? 'armL' : 'armR', pos: a.wrist.clone(), r: 0.08 }); } });
    return out;
  }
  // Called by TearSystem while a monster pulls: type 'arm'|'head'|'split', t 0..1, dir = pull direction (world)
  setTension(type, side, t, dir) { this.tension = t > 0 ? { type, side, t, dir: dir.clone() } : null; }
  // ------------------------------------------------------------------ per-frame pose
  // head pose from the headset (or bot brain), hand targets + quats, grips
  update(dt, time) {
    const A = this.anim;
    this.vel.subVectors(this.headPos, this.prevHead).divideScalar(Math.max(dt, 1e-4)); this.prevHead.copy(this.headPos);
    _a.set(0, 0, -1).applyQuaternion(this.headQuat); this.yaw = Math.atan2(-_a.x, -_a.z);
    const yawQ = new THREE.Quaternion().setFromAxisAngle(UP, this.yaw + Math.PI);
    for (let i = 0; i < 2; i++) { this.handVel[i].subVectors(this.handWorld[i], this.prevHand[i]).divideScalar(Math.max(dt, 1e-4)); this.prevHand[i].copy(this.handWorld[i]); }
    // grabbed tremble / torn shake
    const shake = (this.grabbedBy ? 0.004 : 0) + (A.tornShake > 0 ? 0.02 * A.tornShake / 0.5 : 0);
    if (A.tornShake > 0) A.tornShake -= dt;
    const jitter = shake ? new THREE.Vector3((Math.random() - .5) * shake, (Math.random() - .5) * shake, (Math.random() - .5) * shake) : null;
    if (this.monster) this.updateMonster(dt, time, yawQ, jitter);
    else this.updateSurvivor(dt, time, yawQ, jitter);
    // name tag
    const tagPos = this.monster ? this.mon.body.localToWorld(new THREE.Vector3(0, MONSTER_RIGS[this.monster].tagY, 0)) : this.surv.head.localToWorld(new THREE.Vector3(0, 0.24 + CONFIG.NAMETAG_HEIGHT - 0.1, 0));
    this.tag.position.copy(tagPos); this.tag.quaternion.copy(this.game.camera.getWorldQuaternion(_q));
    this.tag.visible = !this.isLocal && this.root.visible && !(this.ghost && !this.game.player?.creature?.ghost);
  }
  updateSurvivor(dt, time, yawQ, jitter) {
    const S = this.surv, A = this.anim;
    // head: camera sits inside the head
    const headQ = this.headQuat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI));
    if (A.flinch > 0) { A.flinch -= dt; headQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.17 * (A.flinch / 0.15))); }
    const neck = this.headPos.clone().sub(new THREE.Vector3(0, 0.14, 0.02).applyQuaternion(headQ));
    if (!S.headless) { S.head.position.copy(neck); S.head.quaternion.copy(headQ); if (jitter) S.head.position.add(jitter); }
    // torso: hangs below the neck, yaw only, gentle idle wobble, lean toward a missing arm
    const wob = Math.sin(time * Math.PI) * 0.052 * 0.5;
    let lean = 0; if (!S.arms[0].present && S.arms[1].present) lean = 0.14; if (S.arms[0].present && !S.arms[1].present) lean = -0.14;
    S.torso.position.copy(neck).add(new THREE.Vector3(0, -0.2, 0)); if (jitter) S.torso.position.add(jitter);
    S.torso.quaternion.copy(yawQ).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(wob * 0.5, 0, wob + lean)));
    const squash = A.flinch > 0 ? 1 - 0.1 * (A.flinch / 0.15) : 1;
    S.torso.scale.set(1 + (1 - squash) * 0.5, squash, 1 + (1 - squash) * 0.5);
    // tension visuals
    const T = this.tension;
    S.tL.position.set(0, 0, 0); S.tR.position.set(0, 0, 0); S.strands.visible = false;
    for (const c of [...S.caps.shoulder, ...S.caps.shoulderStuff, S.caps.neck, S.caps.neckStuff]) if (!c.userData.final) c.visible = false;
    if (T && T.type === 'split') {
      const gap = T.t * 0.05; S.tL.position.x = gap; S.tR.position.x = -gap;
      this._strands(S.tL.localToWorld(new THREE.Vector3(0, 0.05, 0)), S.tR.localToWorld(new THREE.Vector3(0, 0.05, 0)), T.t);
    }
    S.torso.updateMatrixWorld(true);
    // arms (IK)
    const gore = this.game.save?.data?.gore || 'FULL';
    S.arms.forEach((a, i) => {
      a.group.visible = a.present;
      if (!a.present) return;
      a.shoulder.copy(S.torso.localToWorld(new THREE.Vector3(0.158 * a.side + (i === 0 ? S.tL.position.x : S.tR.position.x), 0.115, 0)));
      let stretch = 1;
      if (T && T.type === 'arm' && T.side === i) {
        const gap = T.t * 0.06; a.shoulder.addScaledVector(T.dir, gap); stretch = 1 + 0.12 * T.t;
        const socket = S.torso.localToWorld(new THREE.Vector3(0.158 * a.side, 0.115, 0));
        this._strands(socket, a.shoulder, T.t);
        const cap = gore === 'OFF' ? S.caps.shoulderStuff[i] : S.caps.shoulder[i]; cap.visible = T.t > 0.25;
      }
      const reach = CONFIG.ARM_SEG_SCALE * 0.3 * stretch;
      const W = this.handTarget[i].clone().sub(new THREE.Vector3(0.05, 0, 0).applyQuaternion(this.handQuat[i]));
      const pole = new THREE.Vector3(a.side * 0.6, -1, -0.4).applyQuaternion(yawQ);
      const bend = solveIK(a.shoulder, W, reach, reach, pole, a.elbow);
      const d = W.distanceTo(a.shoulder); const over = d > 2 * reach ? d / (2 * reach) : 1;   // rubbery stretch if out of reach
      orientX(a.upper, a.shoulder, a.elbow, bend.clone().negate(), 0.3 / over);
      a.wrist.copy(a.elbow).add(_a.subVectors(W, a.elbow).setLength(reach * over));
      orientX(a.fore, a.elbow, a.wrist, bend.clone().negate(), 0.3 / over);
      a.hand.position.copy(a.wrist); a.hand.quaternion.copy(this.handQuat[i]);
      this.handWorld[i].copy(a.wrist).add(new THREE.Vector3(0.05, 0, 0).applyQuaternion(this.handQuat[i]));
      this._grip(a, i, dt);
    });
    if (T && T.type === 'head' && !S.headless) {
      const gap = T.t * 0.05; S.head.position.addScaledVector(T.dir, gap);
      this._strands(S.torso.localToWorld(new THREE.Vector3(0, 0.2, 0)), S.head.position, T.t);
      const cap = gore === 'OFF' ? S.caps.neckStuff : S.caps.neck; cap.visible = T.t > 0.3;
    }
    // blink, talk
    A.blink -= dt;
    if (A.blink <= 0) { A.blinkT = 0.12; A.blink = A.dbl ? 0.18 : 2 + Math.random() * 4; A.dbl = !A.dbl && Math.random() < 0.25; }
    if (A.blinkT > 0) A.blinkT -= dt;
    const wide = A.tornShake > 0 ? 1.2 : 1;
    for (const e of S.eyes) { e.scale.set(wide, A.blinkT > 0 ? 0.1 : wide, wide); }
    if (S.jaw) { const target = Math.min(1, A.talk) * 0.436; S.jaw.rotation.x += (target - S.jaw.rotation.x) * Math.min(1, dt * 14); }
  }
  _strands(a, b, t) {
    const S = this.surv; S.strands.visible = t > 0.08;
    if (!S.strands.visible) return;
    const len = a.distanceTo(b); const mid = a.clone().lerp(b, 0.5); const dir = b.clone().sub(a).normalize();
    S.strands.children.forEach((s, k) => {
      const thin = 1 - t * 0.6;
      s.position.copy(mid).add(s.userData.off); s.quaternion.setFromUnitVectors(UP, dir);
      s.scale.set(thin, Math.max(len, 0.002), thin); s.visible = k < 2 + t * 5;
    });
  }
  _grip(a, i, dt) {
    const want = this.grip[i];
    if (want !== a.hClosed.visible) { a.hClosed.visible = want; a.hOpen.visible = !want; this.gripAnim[i] = 0.08; }
    if (this.gripAnim[i] > 0) { this.gripAnim[i] -= dt; const k = 1 - 0.18 * Math.sin((1 - this.gripAnim[i] / 0.08) * Math.PI); a.hand.scale.set(k, 1 / k, k); } else a.hand.scale.set(1, 1, 1);
  }
  updateMonster(dt, time, yawQ, jitter) {
    const Mo = this.mon, R = Mo.R, A = this.anim;
    const eye = new THREE.Vector3(...R.eye).applyQuaternion(yawQ);
    Mo.body.position.copy(this.headPos).sub(eye); if (jitter) Mo.body.position.add(jitter);
    Mo.body.quaternion.copy(yawQ);
    // infection transform plays in reverse onto the monster (shrinks into place)
    const s = A.transform > 0 ? 1 + 0.25 * (A.transform / 3) : 1;
    Mo.body.scale.setScalar(s);
    if (A.transform > 0) A.transform -= dt;
    Mo.body.updateMatrixWorld(true);
    // breathing (faster when chasing), roar, crawl flatten
    const speed = this.vel.length();
    A.breath = (A.breath || 0) + dt * (2 * Math.PI / (speed > 2 || this.chasing ? 1.2 : 3));
    for (const m of Mo.morphs) {
      const d = m.morphTargetDictionary, inf = m.morphTargetInfluences;
      if (d.breathe !== undefined) inf[d.breathe] = 0.5 + 0.5 * Math.sin(A.breath);
      if (d.roar !== undefined) inf[d.roar] = A.roar > 0 ? Math.min(1, A.roar * 3) : 0;
      if (d.flatten !== undefined) inf[d.flatten] = A.crawl > 0 ? 1 : 0;
    }
    if (Mo.jaw) Mo.jaw.rotation.x = A.roar > 0 ? 0.6 * Math.min(1, A.roar * 3) : 0.05 * (0.5 + 0.5 * Math.sin(A.breath));
    if (A.roar > 0) A.roar -= dt;
    // Stitchface trophy arms sway on springs, big eye twitches
    for (const t of Mo.trophies) {
      t.vx += (-t.ax * 30 - t.vx * 2 + this.vel.z * 0.8) * dt; t.vz += (-t.az * 30 - t.vz * 2 - this.vel.x * 0.8) * dt;
      t.ax += t.vx * dt; t.az += t.vz * dt; t.o.quaternion.copy(t.base).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(t.ax, 0, t.az)));
    }
    if (Mo.eyeBig) { A.twitch -= dt; if (A.twitch <= 0) { A.twitch = 0.6 + Math.random() * 2.5; Mo.eyeBig.rotation.set((Math.random() - .5) * 0.4, (Math.random() - .5) * 0.4, 0); } }
    // Crawler pincers click every 1-2 s
    if (Mo.pincers[0]) { A.pinch = (A.pinch || 1) - dt; const open = A.pinch < 0.12 ? 0 : 0.35; if (A.pinch <= 0) { A.pinch = 1 + Math.random(); this.game.audio?.play('click', Mo.body.position, { volume: 0.4, rate: 0.7 }); }
      Mo.pincers[0].rotation.y = open; Mo.pincers[1].rotation.y = -open; }
    // arms
    const reach = R.seg * 1.0;
    Mo.arms.forEach((a, i) => {
      a.shoulder.copy(Mo.body.localToWorld(a.shoulderLocal.clone()));
      let W, q;
      if (!a.extra) { W = this.handTarget[i].clone().sub(new THREE.Vector3(0.06, 0, 0).applyQuaternion(this.handQuat[i])); q = this.handQuat[i]; }
      else { // crawler's extra arms skitter in a walking cycle synced to movement
        a.phase += dt * (2 + speed * 3);
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(yawQ);
        const base = a.shoulder.clone().add(new THREE.Vector3(a.side * 0.35, 0, 0).applyQuaternion(yawQ)); base.y = Mo.body.position.y - 0.25;
        W = base.addScaledVector(fwd, Math.sin(a.phase) * 0.18); W.y += Math.max(0, Math.cos(a.phase)) * 0.1;
        q = new THREE.Quaternion().setFromRotationMatrix(_m.lookAt(a.shoulder, W, UP)).multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 2));
      }
      const pole = new THREE.Vector3(a.side * 0.6, (this.monster === 'CRAWLER' ? 1 : -1), -0.4).applyQuaternion(yawQ);
      const bend = solveIK(a.shoulder, W, reach, reach, pole, a.elbow);
      const d = W.distanceTo(a.shoulder); const over = d > 2 * reach ? d / (2 * reach) : 1;
      orientX(a.upper, a.shoulder, a.elbow, bend.clone().negate(), R.seg / over);
      a.wrist.copy(a.elbow).add(_a.subVectors(W, a.elbow).setLength(reach * over));
      orientX(a.fore, a.elbow, a.wrist, bend.clone().negate(), R.seg / over);
      a.hand.position.copy(a.wrist); a.hand.quaternion.copy(q);
      if (!a.extra) { this.handWorld[i].copy(a.wrist).add(new THREE.Vector3(0.06, 0, 0).applyQuaternion(q)); this._grip(a, i, dt); }
    });
  }
  // ------------------------------------------------------------------ helpers for tearing / respawn
  // Detach a part: returns the live Object3D(s) (re-parented to the scene) for the physics system
  detach(obj) { obj.updateMatrixWorld(true); const w = new THREE.Matrix4().copy(obj.matrixWorld); this.game.scene.attach(obj); obj.matrix.copy(w); obj.matrix.decompose(obj.position, obj.quaternion, obj.scale); return obj; }
  flinch() { this.anim.flinch = 0.15; }
  shakeTorn() { this.anim.tornShake = 0.5; }
  dispose() { this.root.removeFromParent(); this.tag.removeFromParent(); }
}
